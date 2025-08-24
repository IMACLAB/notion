// tools/render/block.mjs
// ---------- helpers ----------
const esc = (s='') => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

function colorClass(notCol='default'){
  // Notion colors: gray, brown, orange, yellow, green, blue, purple, pink, red
  // with *_background variants, and "default"
  if (!notCol || notCol==='default') return ''
  return ` color-${notCol.replace('_', '-')}`
}

// 노션 rich_text[] → HTML spans (링크/주석/색/코드/볼드 등)
export function rtx(arr=[]){
  return arr.map(seg=>{
    const t = seg?.plain_text ?? ''
    const ann = seg?.annotations || {}
    const url = seg?.href
    const classes = [
      ann.bold ? 'rt-bold' : '',
      ann.italic ? 'rt-italic' : '',
      ann.underline ? 'rt-underline' : '',
      ann.strikethrough ? 'rt-strike' : '',
      ann.code ? 'rt-code' : '',
      colorClass(ann.color)
    ].filter(Boolean).join(' ')
    const open = `<span class="rt ${classes}">`
    const close = `</span>`
    const inner = esc(t)
    const wrapped = ann.code
      ? `<code class="rt-code-inline">${inner}</code>`
      : inner
    return url
      ? `${open}<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${wrapped}</a>${close}`
      : `${open}${wrapped}${close}`
  }).join('')
}

function parseImgFlags(captionText='') {
  const flags = { cls: [], style: '' }
  const mW = captionText.match(/(?:^|\s)w=(\d{2,4})(?:\s|$)/)
  if (mW) flags.style += `max-width:${mW[1]}px;`
  if (/\bwide\b/.test(captionText)) flags.cls.push('img-wide')
  if (/\bfill\b/.test(captionText)) flags.cls.push('img-fill')
  if (/\bleft\b/.test(captionText)) flags.cls.push('img-left')
  if (/\bright\b/.test(captionText)) flags.cls.push('img-right')
  return flags
}

function renderChildren(b){ return b.children?.length ? renderBlocks(b.children) : '' }

// YouTube/Vimeo 임베드
function makeEmbedHTML(url, caption='') {
  if (!url) return ''
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./,'').toLowerCase()
  const figcap = caption ? `<figcaption>${esc(caption)}</figcaption>` : ''

  if (host.includes('youtube.com') || host==='youtu.be') {
    let videoId = ''
    if (host==='youtu.be') videoId = u.pathname.slice(1)
    else if (u.searchParams.get('v')) videoId = u.searchParams.get('v')
    else if (u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/').pop()
    return `<figure class="embed"><div class="embed-inner">
      <iframe src="https://www.youtube.com/embed/${videoId||''}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
    </div>${figcap}</figure>`
  }
  if (host.includes('vimeo.com')) {
    const id = u.pathname.split('/').filter(Boolean).pop() || ''
    return `<figure class="embed"><div class="embed-inner">
      <iframe src="https://player.vimeo.com/video/${id}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
    </div>${figcap}</figure>`
  }
  return `<figure class="embed"><div class="embed-inner"><iframe src="${esc(url)}" loading="lazy"></iframe></div>${figcap}</figure>`
}

// ---------- renderer ----------
export function renderBlocks(blocks=[]) {
  return blocks.map(b=>{
    const t = b.type

    // Headings (toggleable)
    if (t==='heading_1' || t==='heading_2' || t==='heading_3') {
      const rich = rtx(b[t]?.rich_text)
      const isT = b[t]?.is_toggleable
      if (isT) {
        return `<details class="toggle heading ${t}">
                  <summary>${rich}</summary>
                  ${renderChildren(b)}
                </details>`
      }
      const tag = t==='heading_1' ? 'h2' : t==='heading_2' ? 'h3' : 'h4'
      return `<${tag}>${rich}</${tag}>`
    }

    if (t === 'paragraph') {
      const rt = b.paragraph?.rich_text || []
      // (옵션) 단독 유튜브 링크 자동 임베드 규칙 유지하셨다면:
      const onlyLink = rt.length === 1 && rt[0].href
      const url = onlyLink ? rt[0].href : null
      if (url && /youtu\.be|youtube\.com/.test(url)) {
        return `${makeEmbedHTML(url, '')}${renderChildren(b)}`
      }
      return `<p>${rtx(rt)}</p>${renderChildren(b)}`
    }
    
    if (t==='toggle') {
      return `<details class="toggle">
                <summary>${rtx(b.toggle?.rich_text)}</summary>
                ${renderChildren(b)}
              </details>`
    }

    if (t==='bulleted_list_item')
      return `<ul><li>${rtx(b.bulleted_list_item?.rich_text)}${renderChildren(b)}</li></ul>`
    if (t==='numbered_list_item')
      return `<ol><li>${rtx(b.numbered_list_item?.rich_text)}${renderChildren(b)}</li></ol>`

    if (t==='quote') return `<blockquote>${rtx(b.quote?.rich_text)}${renderChildren(b)}</blockquote>`

    if (t==='callout') {
      const icon = b.callout?.icon?.emoji || ''
      const text = rtx(b.callout?.rich_text)
      return `<div class="callout">${icon ? `<span class="icon">${icon}</span>`:''}<div class="content">${text}${renderChildren(b)}</div></div>`
    }

    // column_list: 실제 열 개수 반영
    // column_list 렌더
    if (t === 'column_list') {
      const cols = (b.children||[]).filter(c=>c.type==='column')
      const n = Math.max(1, Math.min(cols.length, 12))
      const colsHtml = cols.map(col=>{
        return `<div class="column"><div class="column-inner">${renderChildren(col)}</div></div>`
      }).join('')
      return `<div class="columns columns-${n}">${colsHtml}</div>`
    }

    if (t==='image') {
      const src = b.image?.local || b.image?.file?.url || b.image?.external?.url
      const captionText = (b.image?.caption||[]).map(x=>x.plain_text||'').join('')
      const flags = parseImgFlags(captionText)
      if (!src) return ''
      return `<figure class="img ${flags.cls.join(' ')}" style="${flags.style}">
                <img src="${esc(src)}" alt="">
                ${captionText ? `<figcaption>${esc(captionText)}</figcaption>` : ''}
              </figure>`
    }

    if (t==='code') {
      const code = (b.code?.rich_text||[]).map(x=>x.plain_text||'').join('')
      const lang = b.code?.language || ''
      return `<pre><code class="language-${esc(lang)}">${esc(code)}</code></pre>`
    }

    // NEW: embed/video/bookmark
    if (t==='video')   return makeEmbedHTML(b.video?.external?.url || b.video?.file?.url, (b.video?.caption||[]).map(x=>x.plain_text).join(''))
    if (t==='embed')   return makeEmbedHTML(b.embed?.url, (b.embed?.caption||[]).map(x=>x.plain_text).join(''))
    if (t==='bookmark' || t==='link_preview') {
      const url = (b.bookmark?.url) || (b.link_preview?.url) || ''
      const cap = (t==='bookmark' ? (b.bookmark?.caption||[]).map(x=>x.plain_text).join('') : '')
      if (!url) return ''
      const domain = (()=>{ try { return new URL(url).hostname.replace(/^www\./,'') } catch { return '' } })()
      const fav = domain ? `https://www.google.com/s2/favicons?domain=${domain}` : ''
      return `<a class="bookmark card" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        <div class="row" style="display:flex;align-items:center;gap:12px">
          ${fav ? `<img src="${fav}" alt="" style="width:18px;height:18px;border-radius:4px">` : ''}
          <div>
            <div style="font-weight:700">${esc(domain||url)}</div>
            ${cap ? `<div class="muted" style="color:var(--muted);font-size:.82rem">${esc(cap)}</div>`:''}
            <div class="muted" style="color:var(--muted);font-size:.78rem">${esc(url)}</div>
          </div>
        </div>
      </a>`
    }

    if (b.children?.length) return renderChildren(b)
    return ''
  }).join('\n')
}