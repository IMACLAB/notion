export function layout({ title, nav, current, body, hero }) {
  const year = new Date().getFullYear()
  const navHtml = (nav||[]).map(i =>
    `<a href="${i.href}" ${i.href===current?'class="current"':''}>${i.label}</a>`
  ).join('')
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
  <header class="site-header">
    <div class="container flex between">
      <a class="logo" href="./index.html">IMaC Lab</a>
      <nav class="nav">${navHtml}</nav>
      <a class="btn primary" href="mailto:lab@imac.example">Contact</a>
    </div>
  </header>

  <main class="container">
    ${hero ? `<section class="hero"><h1>${hero.title}</h1>${hero.desc?`<p>${hero.desc}</p>`:''}</section>` : ''}
    ${body}
  </main>

  <footer class="site-footer">
    © ${year} IMaC Lab · Built from Notion
  </footer>
</body></html>`
}
