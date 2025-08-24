'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import ThemeToggle from './theme'

type NavItem = {
  name: string
  href?: string
  external?: boolean
  children?: { name: string; href: string }[]
}

const NAV: NavItem[] = [
  { name: 'Home', href: '/' },

  {
    name: 'IMaC',
    href: '/imac',
    children: [
      { name: 'Introduction', href: '/imac/introduction' },
      { name: 'Culture',      href: '/imac/culture' },
      { name: 'Member',       href: '/imac/member' },
      { name: 'Blog',         href: '/imac/blog' },
    ],
  },

  {
    name: 'Research',
    href: '/research',
    // 추후 하위 추가 가능:
    // children: [
    //   { name: 'Areas', href: '/research/areas' },
    //   { name: 'Projects', href: '/research/projects' },
    //   { name: 'Systems & Equipment', href: '/research/systems-equipment' },
    // ],
  },

  {
    name: 'Publications',
    href: '/publications',
    // children: [
    //   { name: 'Papers', href: '/publications/papers' },
    //   { name: 'Patents', href: '/publications/patents' },
    //   { name: 'Open Sources', href: '/publications/open-sources' },
    // ],
  },

  {
    name: 'Teaching',
    href: '/teaching',
    // children: [
    //   { name: 'Courses', href: '/teaching/courses' },
    //   { name: 'Consultation', href: '/teaching/consultation' },
    // ],
  },

  {
    name: 'Private web',
    href: 'https://www.notion.so/imaclab/Intelligent-Mechatronics-and-Control-Lab-76debea4a6a3419d82b20edc2da5e3b0?pvs=4',
    external: true,
  },
]

export function Navbar() {
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    window.addEventListener('click', onClickOutside)
    return () => window.removeEventListener('click', onClickOutside)
  }, [])

  const isActive = (href?: string) => {
    if (!href) return false
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="-ml-[8px] mb-16 tracking-tight">
      <div className="lg:sticky lg:top-20">
        <nav
          className="flex flex-row items-start relative px-0 pb-0 fade md:overflow-auto scroll-pr-6 md:relative"
          id="nav"
          aria-label="Primary"
          ref={menuRef}
        >
          <div className="flex flex-row flex-wrap items-center gap-1 pr-10">
            {NAV.map((item) => {
              const active = isActive(item.href)
              const baseCls =
                'transition-all flex items-center relative py-1 px-2 m-1 rounded-md'
              const activeCls =
                active
                  ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-100/70 dark:bg-neutral-800'
                  : 'hover:text-neutral-800 dark:hover:text-neutral-200'

              if (item.children?.length) {
                const isOpen = openMenu === item.name
                return (
                  <div
                    key={item.name}
                    className="relative"
                    onMouseEnter={() => setOpenMenu(item.name)}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    <button
                      className={`${baseCls} ${activeCls}`}
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenu((prev) => (prev === item.name ? null : item.name))
                      }}
                    >
                      {item.name}
                      <svg
                        className="ml-1 h-4 w-4 opacity-70"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 1 1 .94 1.16l-4.24 3.36a.75.75 0 0 1-.94 0L5.21 8.39a.75.75 0 0 1 .02-1.18z" />
                      </svg>
                    </button>

                    {/* 드롭다운 */}
                    <div
                      role="menu"
                      className={`absolute left-0 mt-2 min-w-[220px] rounded-xl border border-neutral-200/60 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-2 z-40 ${
                        isOpen ? 'block' : 'hidden'
                      }`}
                    >
                      {item.children.map((c) => {
                        const childActive = isActive(c.href)
                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            role="menuitem"
                            className={`block rounded-md px-3 py-2 text-sm ${
                              childActive
                                ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                            onClick={() => setOpenMenu(null)}
                          >
                            {c.name}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              // 외부 링크
              if (item.external && item.href) {
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${baseCls} ${activeCls}`}
                  >
                    {item.name}
                  </a>
                )
              }

              // 일반 링크
              return (
                <Link key={item.name} href={item.href ?? '#'} className={`${baseCls} ${activeCls}`}>
                  {item.name}
                </Link>
              )
            })}
          </div>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </aside>
  )
}
