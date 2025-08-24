// content/introduction.ts
// ⚠️ tsconfig.json: { "compilerOptions": { "resolveJsonModule": true, "esModuleInterop": true } }
import raw from "@/notion-data/imac/introduction.json"

export type Introduction = {
  title: string
  description?: string
  mission?: string
  cover?: string | null
  blocks?: any[]
}

/* ---- helpers ---- */
function rtToText(rt?: any[]): string {
  return (rt ?? []).map((r: any) => r?.plain_text ?? "").join("")
}
function pick(obj: any, path: (string | number)[], fallback?: any) {
  return path.reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj) ?? fallback
}

/* ---- mapping ----
   다양한 JSON 스키마(Title/Name, Description/Mission 존재 유무)를 대응합니다.
*/
const titleFromProps =
  pick(raw, ["properties", "Title", "title", 0, "plain_text"]) ||
  pick(raw, ["properties", "Name",  "title", 0, "plain_text"]) ||
  raw.title ||
  "Introduction"

const descFromProps   = rtToText(pick(raw, ["properties", "Description", "rich_text"]))
const missionFromProps= rtToText(pick(raw, ["properties", "Mission",     "rich_text"]))

const blocks: any[] = (raw as any).blocks ?? []

// 블록에서 앞 1~2개 문단을 보조 설명으로 활용(필드가 없을 때)
const firstPara  = blocks.find(b => b.type === "paragraph")
const secondPara = blocks.slice(1).find(b => b.type === "paragraph")

const description = descFromProps   || rtToText(firstPara?.paragraph?.rich_text)
const mission     = missionFromProps|| rtToText(secondPara?.paragraph?.rich_text)

export const introduction: Introduction = {
  title:  String(titleFromProps),
  description: description || undefined,
  mission:     mission || undefined,
  cover: raw?.cover?.external?.url ?? raw?.cover?.file?.url ?? null,
  blocks,
}
