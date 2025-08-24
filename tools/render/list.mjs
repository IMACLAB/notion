import { pickProperty, coverOf, slugify } from '../map.mjs'

export function listCards(dbJson, map, detailOpt, view='cards') {
  const items = (dbJson.results || dbJson.items || []).map(page=>{
    const title = pickProperty(page, map.title) || 'Untitled'
    const cover = pickProperty(page, map.cover) || coverOf(page)
    const date  = map.date ? pickProperty(page, map.date) : undefined
    const excerpt = map.excerpt ? pickProperty(page, map.excerpt) : undefined
    const tags = map.tags ? pickProperty(page, map.tags) : undefined
    let slug = map.slug ? pickProperty(page, map.slug) : undefined
    if (!slug) slug = slugify(title)
    return { page, title, cover, date, excerpt, tags, slug }
  })

  if (view === 'table') {
    const rows = items.map(i=>`<tr>
      <td>${i.title}</td>
      <td>${i.date||''}</td>
      <td>${Array.isArray(i.tags)?i.tags.join(', '):''}</td>
    </tr>`).join('')
    return { html: `<table class="table"><tbody>${rows}</tbody></table>`, items }
  }

  const cards = items.map(it=>`
    <a class="card" href="${detailOpt?.enable ? `./${detailOpt.pathTemplate.replace('{slug}', it.slug)}` : '#'}">
      ${it.cover? `<img src="${it.cover}" alt="">` : ''}
      ${it.date? `<div class="badge">${it.date}</div>` : ''}
      <h3>${it.title}</h3>
      ${it.excerpt? `<p>${it.excerpt}</p>` : ''}
      ${Array.isArray(it.tags)? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${it.tags.map(t=>`<span class="badge">${t}</span>`).join('')}
      </div>`:''}
    </a>`).join('\n')

  return { html: `<div class="grid cards">${cards}</div>`, items }
}
