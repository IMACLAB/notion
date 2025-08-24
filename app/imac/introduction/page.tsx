// app/imac/introduction/page.tsx
import Image from "next/image"
import { introduction } from "@/content/introduction"

export const runtime = "edge" // Cloudflare Pages 등 Edge 런타임 호환

function Block({ b }: { b: any }) {
  switch (b.type) {
    case "heading_1":
      return <h1 className="text-3xl font-bold mt-6 mb-3">{b.heading_1?.rich_text?.[0]?.plain_text}</h1>
    case "heading_2":
      return <h2 className="text-2xl font-semibold mt-5 mb-2">{b.heading_2?.rich_text?.[0]?.plain_text}</h2>
    case "heading_3":
      return <h3 className="text-xl font-semibold mt-4 mb-2">{b.heading_3?.rich_text?.[0]?.plain_text}</h3>
    case "paragraph":
      return <p className="mb-3 leading-7 text-neutral-800 dark:text-neutral-200">
        {b.paragraph?.rich_text?.map((r: any, i: number) => <span key={i}>{r.plain_text}</span>)}
      </p>
    case "bulleted_list_item":
      return <ul className="list-disc pl-6 mb-2">
        <li>{b.bulleted_list_item?.rich_text?.map((r: any, i: number) => <span key={i}>{r.plain_text}</span>)}</li>
      </ul>
    case "numbered_list_item":
      return <ol className="list-decimal pl-6 mb-2">
        <li>{b.numbered_list_item?.rich_text?.map((r: any, i: number) => <span key={i}>{r.plain_text}</span>)}</li>
      </ol>
    case "image": {
      const src = b.image?.file?.url || b.image?.external?.url
      const caption = b.image?.caption?.[0]?.plain_text
      // Next/Image는 외부도메인 허용 설정 필요( next.config images.remotePatterns )
      return src ? (
        <figure className="my-4">
          {/* 필요 시 <img src={src} .../> 로 변경 */}
          <img src={src} alt={caption ?? ""} className="rounded-xl border border-neutral-200/50 dark:border-neutral-800" />
          {caption && <figcaption className="text-sm text-neutral-500 mt-1">{caption}</figcaption>}
        </figure>
      ) : null
    }
    case "quote":
      return <blockquote className="border-l-4 pl-4 italic text-neutral-700 dark:text-neutral-300 mb-3">
        {b.quote?.rich_text?.map((r: any, i: number) => <span key={i}>{r.plain_text}</span>)}
      </blockquote>
    case "code":
      return <pre className="bg-neutral-950/90 text-neutral-50 rounded-xl p-4 overflow-auto mb-3">
        <code>{b.code?.rich_text?.map((r: any, i: number) => r.plain_text).join("")}</code>
      </pre>
    default:
      return null
  }
}

export default function IntroductionPage() {
  return (
    <article className="prose dark:prose-invert max-w-none">
      {/* Cover */}
      {introduction.cover && (
        <div className="mb-6">
          {/* 외부 이미지면 next.config 설정 필요 → 간단히 img 태그로 대체해도 됩니다 */}
          <img src={introduction.cover} alt="" className="w-full rounded-2xl object-cover border border-neutral-200/50 dark:border-neutral-800" />
        </div>
      )}

      {/* Title & summary */}
      <h1 className="!mb-2">{introduction.title}</h1>
      {introduction.description && <p className="text-lg text-neutral-700 dark:text-neutral-300">{introduction.description}</p>}
      {introduction.mission && <blockquote className="mt-2">{introduction.mission}</blockquote>}

      {/* Body blocks */}
      <div className="mt-6">
        {introduction.blocks?.map((b: any, i: number) => <Block key={b.id ?? i} b={b} />)}
      </div>
    </article>
  )
}
