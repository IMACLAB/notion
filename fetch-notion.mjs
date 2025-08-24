// fetch-notion.mjs
// Notion API → JSON/이미지 캐시 (+ Incremental sync)
// - Incremental: last_edited_time 기준으로 변경분만 수집
// - 이미지/파일 로컬 캐시: 만료 URL 문제 방지
// - ID 정규화: URL/하이픈 포함도 허용
// - 안전 마진: 마지막 동기시각 - 2분
// ----------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@notionhq/client'

// ---------------- Paths & IO ----------------
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const ROOT     = __dirname
const OUT_DIR  = path.join(ROOT, 'notion-data')
const IMG_DIR  = path.join(ROOT, 'images')
const CACHE_DIR= path.join(ROOT, '.cache')
const STATE_F  = path.join(CACHE_DIR, 'state.json')

// Ensure dirs
for (const d of [OUT_DIR, IMG_DIR, CACHE_DIR]) fs.mkdirSync(d, { recursive: true })

// ---------------- Load Config ----------------
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf-8'))

// Token priority: config → env
const TOKEN =
  (CFG?.notion?.notion_token && String(CFG.notion.notion_token).trim()) ||
  (process.env.NOTION_TOKEN && String(process.env.NOTION_TOKEN).trim()) ||
  ''

if (!TOKEN) {
  console.error('❌ Notion token not found. Put it in site.config.json -> notion.notion_token or set NOTION_TOKEN env.')
  process.exit(1)
}

const notion = new Client({ auth: TOKEN })

// ---------------- Utilities ----------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function withRetry(fn, tries = 5, label = 'request') {
  let n = 0
  while (true) {
    try {
      return await fn()
    } catch (e) {
      n++
      const wait = Math.min(2000, 250 * 2 ** (n - 1))
      const msg = e?.body?.message || e?.message || String(e)
      if (n >= tries) {
        console.error(`❌ ${label} failed after ${tries} tries:`, msg)
        throw e
      }
      console.warn(`↻ Retry ${n}/${tries} for ${label} in ${wait}ms … (${msg})`)
      await sleep(wait)
    }
  }
}

// Accept ID in various forms: raw 32-hex, dashed, URL
function normalizeId(input) {
  if (!input) return null
  const s = String(input).trim()
  // Try to extract 32 hex from anywhere (URL-safe)
  const m = s.match(/[0-9a-fA-F]{32}/)
  const raw = m ? m[0] : s.replace(/-/g, '')
  return raw.length === 32 ? raw.toLowerCase() : null
}

// State (for incremental)
function loadState() {
  if (!fs.existsSync(STATE_F)) return { lastSyncISO: null, pages: {}, dbItems: {} }
  try { return JSON.parse(fs.readFileSync(STATE_F, 'utf-8')) }
  catch { return { lastSyncISO: null, pages: {}, dbItems: {} } }
}
function saveState(state) {
  fs.writeFileSync(STATE_F, JSON.stringify(state, null, 2))
}
function isoMinusMinutes(iso, mins = 2) {
  if (!iso) return null
  const t = new Date(iso).getTime() - mins * 60 * 1000
  return new Date(t).toISOString()
}

// File helpers
function safeExtFromUrl(u, fallback = 'bin') {
  try {
    const p = new URL(u).pathname
    const ext = (p.split('.').pop() || '').split('?')[0]
    if (!ext || ext.length > 6) return fallback
    return ext
  } catch {
    return fallback
  }
}

async function downloadFile(url, fnameHint = 'asset') {
  if (!url) return null
  try {
    const ext = safeExtFromUrl(url, 'bin')
    const name = `${fnameHint}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
    const dst = path.join(IMG_DIR, name)
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('⚠️ download failed (status)', res.status, url)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dst, buf)
    return `./images/${name}`
  } catch (e) {
    console.warn('⚠️ download error', e?.message || e)
    return null
  }
}

// ---------------- Notion fetchers ----------------
async function listBlocks(blockId) {
  const all = []
  let cursor
  while (true) {
    const res = await withRetry(
      () => notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 }),
      5,
      `blocks.children.list ${blockId}`
    )
    all.push(...res.results)
    if (!res.has_more) break
    cursor = res.next_cursor
  }

  // Recursively collect children & cache images/files inside blocks
  for (const b of all) {
    if (b.has_children) b.children = await listBlocks(b.id)

    if (b.type === 'image') {
      const url = b.image?.file?.url || b.image?.external?.url
      const local = await downloadFile(url, 'image')
      if (local) b.image.local = local
    }

    // Optional: file block (if used)
    if (b.type === 'file') {
      const url = b.file?.file?.url || b.file?.external?.url
      const local = await downloadFile(url, 'file')
      if (local) b.file.local = local
    }
  }
  return all
}

async function fetchPageIfChanged(pageId, aliasOut = null, state) {
  const meta = await withRetry(
    () => notion.pages.retrieve({ page_id: pageId }),
    5,
    `pages.retrieve ${pageId}`
  )

  const prev = state.pages[pageId]
  const changed = !prev || (meta.last_edited_time > prev.last_edited_time)

  if (!changed) {
    console.log(`= page unchanged: ${pageId}`)
    return null
  }

  console.log(`→ page changed: ${pageId}`)
  const blocks = await listBlocks(pageId)

  // Cover cache (optional)
  const cov = meta?.cover?.file?.url || meta?.cover?.external?.url
  const localCover = cov ? await downloadFile(cov, 'cover') : (prev?.cover_local || null)

  const payload = { page: meta, blocks, cover_local: localCover }

  // Save with alias (for easier consumption)
  if (aliasOut) {
    fs.writeFileSync(path.join(OUT_DIR, `page-${aliasOut}.json`), JSON.stringify(payload, null, 2))
  } else {
    fs.writeFileSync(path.join(OUT_DIR, `page-${pageId}.json`), JSON.stringify(payload, null, 2))
  }

  state.pages[pageId] = {
    last_edited_time: meta.last_edited_time,
    cover_local: localCover || null
  }
  return payload
}

async function queryDatabaseIncremental(database_id, sinceISO) {
  const all = []
  let cursor
  while (true) {
    const body = { database_id, start_cursor: cursor, page_size: 100 }
    if (sinceISO) {
      body.filter = {
        timestamp: 'last_edited_time',
        last_edited_time: { on_or_after: sinceISO }
      }
    }
    const res = await withRetry(() => notion.databases.query(body), 5, `databases.query ${database_id}`)
    all.push(...res.results)
    if (!res.has_more) break
    cursor = res.next_cursor
  }
  return all
}

async function fullIdsInDatabase(database_id) {
  // For reconcile: get all IDs
  const all = []
  let cursor
  while (true) {
    const res = await withRetry(
      () => notion.databases.query({ database_id, start_cursor: cursor, page_size: 100 }),
      5,
      `databases.query(all) ${database_id}`
    )
    all.push(...res.results)
    if (!res.has_more) break
    cursor = res.next_cursor
  }
  return all.map(x => x.id)
}

async function syncDatabase(database_id, outName, state, options = {}) {
  const { sinceISO, fullMode, fetchBlocksForRows = false } = options

  // What changed?
  const changedRows = await queryDatabaseIncremental(database_id, fullMode ? null : sinceISO)
  console.log(`→ DB ${outName}: ${changedRows.length} changed ${fullMode ? '(full)' : '(incremental)'}`)

  // Load existing snapshot (merge update)
  const outFile = path.join(OUT_DIR, `db-${outName}.json`)
  let snapshot = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf-8')) : { results: [] }
  const byId = new Map(snapshot.results.map(x => [x.id, x]))

  // Update changed rows
  for (const p of changedRows) {
    // Cover to local
    const cov = p?.cover?.file?.url || p?.cover?.external?.url
    if (cov) p.cover_local = await downloadFile(cov, 'cover')

    // Files property: download all
    for (const [k, prop] of Object.entries(p.properties || {})) {
      if (prop?.type === 'files' && Array.isArray(prop.files)) {
        for (const f of prop.files) {
          const url = f?.file?.url || f?.external?.url
          if (url) f.local = await downloadFile(url, 'file')
        }
      }
    }

    // Optional: fetch blocks for each row detail page (expensive)
    if (fetchBlocksForRows) {
      try {
        p.blocks = await listBlocks(p.id)
      } catch (e) {
        console.warn('⚠️ listBlocks(row) failed', p.id, e?.message || e)
      }
    }

    byId.set(p.id, p)
    state.dbItems[p.id] = { last_edited_time: p.last_edited_time }
  }

  // Reconcile deletes only in full mode
  if (fullMode) {
    const currentIds = new Set(await fullIdsInDatabase(database_id))
    for (const id of Array.from(byId.keys())) {
      if (!currentIds.has(id)) {
        byId.delete(id) // removed/archived row
      }
    }
  }

  snapshot = { results: Array.from(byId.values()) }
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2))
}

// ---------------- Main ----------------
async function main() {
  // Normalize IDs (accept URL/dashed/raw)
  const idsInput = CFG?.notion || {}
  const ids = {
    intro_page_id:   normalizeId(idsInput.intro_page_id),
    culture_page_id: normalizeId(idsInput.culture_page_id),
    members_db_id:   normalizeId(idsInput.members_db_id),
    blog_db_id:      normalizeId(idsInput.blog_db_id),
  }
  console.log('Notion IDs:', ids)

  const state = loadState()
  const fullMode = process.env.FULL_RECONCILE === '1' || !state.lastSyncISO
  const sinceISO = fullMode ? null : isoMinusMinutes(state.lastSyncISO, 2)
  console.log(fullMode ? '🟦 FULL sync' : `🟨 INCREMENTAL since ${sinceISO}`)

  const fetchBlocksForRows = process.env.FETCH_BLOCKS_FOR_DB === '1' // optional heavy mode

  // PAGES
  if (ids.intro_page_id) {
    await fetchPageIfChanged(ids.intro_page_id, 'introduction', state)
  } else {
    console.warn('⚠️ intro_page_id missing; skip')
  }

  if (ids.culture_page_id) {
    await fetchPageIfChanged(ids.culture_page_id, 'culture', state)
  } else {
    console.warn('⚠️ culture_page_id missing; skip')
  }

  // DATABASES
  if (ids.members_db_id) {
    await syncDatabase(ids.members_db_id, 'members', state, { sinceISO, fullMode, fetchBlocksForRows })
  } else {
    console.warn('⚠️ members_db_id missing; skip')
  }

  if (ids.blog_db_id) {
    await syncDatabase(ids.blog_db_id, 'blog', state, { sinceISO, fullMode, fetchBlocksForRows })
  } else {
    console.warn('⚠️ blog_db_id missing; skip')
  }

  // Save state
  state.lastSyncISO = new Date().toISOString()
  saveState(state)

  console.log(fullMode ? '✓ FULL sync done' : '✓ INCREMENTAL sync done')
}

main().catch(err => {
  console.error('❌ fetch-notion.mjs failed:', err?.stack || err?.message || err)
  process.exit(1)
})