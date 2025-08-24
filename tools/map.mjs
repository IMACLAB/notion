export const rt = (arr=[]) => arr.map(r=>r.plain_text||'').join('')
export const get = (obj, path=[], dflt=undefined) =>
  path.reduce((acc,k)=> (acc==null? undefined : acc[k]), obj) ?? dflt

export function pickProperty(page, names=[]) {
  for (const name of names) {
    const prop = page?.properties?.[name]
    if (!prop) continue
    const t = prop?.type
    if (t==='title') return rt(prop.title)
    if (t==='rich_text') return rt(prop.rich_text)
    if (t==='select') return prop.select?.name
    if (t==='multi_select') return (prop.multi_select||[]).map(x=>x.name)
    if (t==='files') {
      const f = prop.files?.[0]
      return f?.local || f?.file?.url || f?.external?.url
    }
    if (t==='date') return prop.date?.start
    if (t==='url') return prop.url
    if (t==='people') return (prop.people||[]).map(p=>p.name)
    if (t==='number') return prop.number
  }
  return undefined
}

export const coverOf = (x) => x?.cover_local || x?.cover?.file?.url || x?.cover?.external?.url || null

export function slugify(s='') {
  return s.toString().toLowerCase().trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu,'-')
    .replace(/(^-|-$)/g,'')
}
