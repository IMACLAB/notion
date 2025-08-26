// fetch-notion.mjs
// Notion API → JSON/이미지 캐시 (Incremental sync + Stable cache)
// - Incremental: last_edited_time 기준으로 변경분만 조회
// - 이미지/파일 캐시: 서명 URL이 바뀌어도 콘텐츠 해시로 재사용 (중복 다운로드 방지)
// - ID 정규화: URL/하이픈 포함도 허용
// - FULL_RECONCILE=1 -> 풀 스캔(삭제/아카이브 정합성)
// - FETCH_BLOCKS_FOR_DB=1 -> DB 행 상세 블록까지 수집(무거움)
// ----------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Client } from '@notionhq/client'

// ---------------- Paths & IO ----------------
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const ROOT      = __dirname
const OUT_DIR   = path.join(ROOT, 'notion-data')
const IMG_DIR   = path.join(ROOT, 'images')
const CACHE_DIR = path.join(ROOT, '.cache')
const STATE_F   = path.join(CACHE_DIR, 'state.json')

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
      const wait = Math.min(2500, 250 * 2 ** (n - 1))
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

// State (for incremental + cache)
function loadState() {
  if (!fs.existsSync(STATE_F)) return { lastSyncISO: null, pages: {}, dbItems: {}, images: {} }
  try {
    const s = JSON.parse(fs.readFileSync(STATE_F, 'utf-8'))
    if (!s.images) s.images = {}
    if (!s.pages) s.pages = {}
    if (!s.dbItems) s.dbItems = {}
    return s
  } catch {
    return { lastSyncISO: null, pages: {}, dbItems: {}, images: {} }
  }
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
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex')

// Stable-cache download: key is stable (page/block/property-based), filename uses content hash
async function downloadFileCached(key, url, fnameHint, state) {
  if (!url) return state.images[key]?.local || null

  // Reuse if already cached and file exists
  const cached = state.images[key]
  if (cached?.local) {
    const localPath = cached.local.startsWith('./') ? cached.local.slice(2) : cached.local
    const abs = path.join(ROOT, localPath)
    if (fs.existsSync(abs)) return cached.local
  }

  // Download
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('⚠️ download failed', res.status, url)
      return cached?.local || null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const hash = sha1(buf)
    const ext = safeExtFromUrl(url, 'bin')
    const name = `${fnameHint}-${hash.slice(0, 12)}.${ext}`
    const localRel = `./images/${name}`
    const dst = path.join(IMG_DIR, name)

    if (!fs.existsSync(dst)) fs.writeFileSync(dst, buf)

    state.images[key] = {
      local: localRel,
      hash: `sha1:${hash}`,
      size: buf.length,
      updated: new Date().toISOString(),
      last_url: url
    }
    return localRel
  } catch (e) {
    console.warn('⚠️ download error', e?.message || e)
    return cached?.local || null
  }
}

// ---------------- Notion fetchers ----------------
async function listBlocks(blockId, state) {
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
    if (b.has_children) b.children = await listBlocks(b.id, state)

    if (b.type === 'image') {
      const url = b.image?.file?.url || b.image?.external?.url
      const key = `block:${b.id}:image`
      const local = await downloadFileCached(key, url, 'image', state)
      if (local) b.image.local = local
    }

    if (b.type === 'file') {
      const url = b.file?.file?.url || b.file?.external?.url
      const key = `block:${b.id}:file`
      const local = await downloadFileCached(key, url, 'file', state)
      if (local) b.file.local = local
    }
  }
  return all
}

async function fetchPageIfChanged(pageId, aliasOut, state) {
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
  const blocks = await listBlocks(pageId, state)

  // Cover cache
  const cov = meta?.cover?.file?.url || meta?.cover?.external?.url
  const coverKey = `page:${meta.id}:cover`
  const localCover = cov
    ? await downloadFileCached(coverKey, cov, 'cover', state)
    : (state.images[coverKey]?.local || prev?.cover_local || null)

  const payload = { page: meta, blocks, cover_local: localCover }

  // Save with alias (for easier consumption)
  const fname = aliasOut ? `page-${aliasOut}.json` : `page-${pageId}.json`
  fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(payload, null, 2))

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
    if (cov) {
      const key = `page:${p.id}:cover`
      p.cover_local = await downloadFileCached(key, cov, 'cover', state)
    }

    // Files property: download all
    for (const [propName, prop] of Object.entries(p.properties || {})) {
      if (prop?.type === 'files' && Array.isArray(prop.files)) {
        for (let i = 0; i < prop.files.length; i++) {
          const f = prop.files[i]
          const url = f?.file?.url || f?.external?.url
          const key = `page:${p.id}:prop:${propName}:${i}`
          const local = await downloadFileCached(key, url, 'file', state)
          if (local) f.local = local
        }
      }
    }

    // Optional: fetch blocks for each row detail page (expensive)
    if (fetchBlocksForRows) {
      try {
        p.blocks = await listBlocks(p.id, state)
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
    home_page_id: normalizeId(idsInput.home_page_id),
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
  if (ids.home_page_id) {
    await fetchPageIfChanged(ids.home_page_id, 'home', state)
  } else {
    console.warn('⚠️ home_page_id missing; skip')
  }

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