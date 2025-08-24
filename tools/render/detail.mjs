import { pickProperty } from '../map.mjs'
import { renderBlocks } from './block.mjs'

export function detailBody(page, detailCfg) {
  // 우선순위: 블록 → 본문 후보 필드 → 비어있음
  const blocks = page.blocks || []
  if (blocks.length) return renderBlocks(blocks)
  for (const k of (detailCfg?.body || [])) {
    const v = pickProperty(page, [k])
    if (typeof v === 'string' && v) return `<p>${v}</p>`
  }
  return `<p>(본문 없음)</p>`
}
