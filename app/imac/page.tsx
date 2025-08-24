import Link from "next/link";

export const runtime = 'edge';

export default function ImacHub() {
  const items = [
    { href: "/imac/introduction", title: "Introduction", desc: "연구실 소개" },
    { href: "/imac/culture", title: "Culture", desc: "랩 문화" },
    { href: "/imac/member", title: "Member", desc: "구성원" },
    { href: "/imac/blog", title: "Blog", desc: "랩 블로그" }
  ];
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      {items.map(it => (
        <Link key={it.href} href={it.href} className="rounded-2xl p-6 shadow hover:shadow-lg bg-white">
          <h3 className="text-lg font-bold">{it.title}</h3>
          <p className="text-sm text-gray-600">{it.desc}</p>
        </Link>
      ))}
    </section>
  );
}
