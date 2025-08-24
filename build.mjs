import fs from 'node:fs'
import path from 'node:path'
import { layout } from './tools/render/layout.mjs'
import { renderBlocks } from './tools/render/block.mjs'
import { listCards } from './tools/render/list.mjs'

const CFG = JSON.parse(fs.readFileSync('site.config.json','utf-8'))
const DIST = 'dist'
fs.mkdirSync(DIST, { recursive: true })
if (fs.existsSync('public/styles.css')) fs.copyFileSync('public/styles.css', path.join(DIST,'styles.css'))
if (fs.existsSync('images')) fs.cpSync('images', path.join(DIST,'images'), { recursive: true })

const esc = (s='') => s.replace(/[&<>]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m]))
const coverOf = x => x?.cover_local || x?.cover?.file?.url || x?.cover?.external?.url || null

function write(htmlPath, bodyHtml, title, currentHref, hero) {
  const html = layout({ title, nav: CFG.site.nav, current: currentHref, body: bodyHtml, hero })
  fs.writeFileSync(path.join(DIST, htmlPath), html, 'utf-8')
}

// Introduction
(function buildIntro(){
  const f = 'notion-data/page-introduction.json'
  if (!fs.existsSync(f)) return
  const data = JSON.parse(fs.readFileSync(f,'utf-8'))
  const cov = coverOf(data)
  const body = `${cov? `<img src="${cov}" alt="" style="width:100%;border-radius:16px;border:1px solid var(--line);margin:8px 0 16px">`:''}
${renderBlocks(data.blocks||[])}`
  write('introduction.html', body, 'Introduction', 'imac.html', { title:'IMaC / Introduction', desc:'지능형 메카트로닉스 및 제어 연구실 소개' })
})();

// Culture
(function buildCulture(){
  const f = 'notion-data/page-culture.json'
  if (!fs.existsSync(f)) return
  const data = JSON.parse(fs.readFileSync(f,'utf-8'))
  const cov = coverOf(data)
  const body = `${cov? `<img src="${cov}" alt="" style="width:100%;border-radius:16px;border:1px solid var(--line);margin:8px 0 16px">`:''}
${renderBlocks(data.blocks||[])}`
  write('culture.html', body, 'Culture', 'imac.html', { title:'IMaC / Culture', desc:'랩 문화 · 일하는 방식' })
})();

// IMaC hub
(function buildImacHub(){
  const body = `<div class="grid cards">
    <a class="card" href="./introduction.html"><h3>Introduction</h3><p>연구실 소개</p></a>
    <a class="card" href="./culture.html"><h3>Culture</h3><p>랩 문화</p></a>
  </div>`
  write('imac.html', body, 'IMaC', 'imac.html', { title:'IMaC', desc:'Introduction · Culture' })
})();

// Members
(function buildMembers(){
  const f = 'notion-data/db-members.json'
  if (!fs.existsSync(f)) return
  const data = JSON.parse(fs.readFileSync(f,'utf-8'))
  const map = CFG.map?.members || {}
  const { html } = listCards(data, map, null, 'cards')
  write('members.html', `<h1>Members</h1>${html}`, 'Members', 'members.html', { title:'Members', desc:'People in the lab' })
})();

// Blog + details (summary only)
(function buildBlog(){
  const f = 'notion-data/db-blog.json'
  if (!fs.existsSync(f)) return
  const data = JSON.parse(fs.readFileSync(f,'utf-8'))
  const map = CFG.map?.blog || {}
  const detail = { enable: true, pathTemplate: 'blog-{slug}.html', body: map.body || [] }
  const { html, items } = listCards(data, map, detail, 'cards')
  write('blog.html', `<h1>Blog</h1>${html}`, 'Blog', 'blog.html', { title:'Blog', desc:'News & stories' })

  for (const it of items) {
    const cover = it.cover ? `<img src="${it.cover}" alt="" style="width:100%;border-radius:16px;border:1px solid var(--line);margin:8px 0 16px">` : ''
    const body = `${cover}
<h1>${esc(it.title)}</h1>
${it.date? `<div class="badge">${esc(it.date)}</div>`:''}
${it.excerpt? `<p>${esc(it.excerpt)}</p>`:''}
<p style="color:var(--muted)">(본문 블록 렌더는 fetch 단계에서 row.blocks 수집 후 renderBlocks 적용 가능)</p>`
    write(`blog-${it.slug}.html`, body, it.title, 'blog.html', null)
  }
})();

// Home
(function buildHome(){
  const tiles = CFG.index?.tiles || []
  const cards = tiles.map(t=>`<a class="card" href="./${t.href}"><h3>${esc(t.title)}</h3><p>${esc(t.desc||'')}</p></a>`).join('')
  const body = `<div class="grid cards">${cards}</div>`
  write('index.html', body, CFG.site.title, 'index.html', { title: CFG.site.title, desc:'Built from Notion' })
})();

console.log('✓ Built HTML → dist/')
