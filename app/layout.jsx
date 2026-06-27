'use client'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import AuthGate from '@/components/AuthGate'

const NAV = [
  { href: '/',              label: 'Overview',     icon: '✨' },
  { href: '/conversations', label: 'Inbox',        icon: '💬' },
  { href: '/bookings',      label: 'Bookings',     icon: '📅' },
  { href: '/branches',      label: 'Branches',     icon: '🏠' },
  { href: '/stylists',      label: 'Stylists',     icon: '💇' },
  { href: '/services',      label: 'Services',     icon: '✂️' },
  { href: '/promotions',    label: 'Promotions',   icon: '🏷️' },
  { href: '/before-after',  label: 'Gallery',      icon: '🖼️' },
  { href: '/employees',     label: 'Staff',        icon: '👥' },
  { href: '/settings',      label: 'Settings',     icon: '⚙️' },
]

export default function RootLayout({ children }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isConversations = pathname.startsWith('/conversations')
  // `collapsed` only narrows the rail on desktop; on mobile the drawer is always
  // full-width, so label/brand hiding is gated behind `md:` here.
  const hideWhenCollapsed = collapsed ? 'md:hidden' : ''

  return (
    <html lang="en">
      <head>
        <title>Neko Salon — Studio Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body className="h-screen overflow-hidden">
        <AuthGate>
          <div className="flex h-full">
            {/* Dimmer behind the mobile drawer */}
            {mobileOpen && (
              <div onClick={() => setMobileOpen(false)}
                className="fixed inset-0 bg-ink-900/40 z-40 md:hidden" aria-hidden />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 w-64 md:static md:z-auto md:w-auto
              ${collapsed ? 'md:w-20' : 'md:w-60'}
              bg-white border-r border-ink-100 flex flex-col shrink-0
              transition-transform md:transition-all duration-300
              ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
              <div className="h-16 md:h-20 flex items-center px-5 border-b border-ink-100">
                <div className={`flex-1 ${hideWhenCollapsed}`}>
                  <p className="display text-xl text-ink-800 leading-tight">Neko</p>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-rose-500">Salon Studio</p>
                </div>
                {/* Collapse toggle (desktop) */}
                <button onClick={() => setCollapsed(!collapsed)}
                  className="hidden md:flex text-ink-300 hover:text-ink-600 text-sm w-7 h-7 rounded-md hover:bg-cream-bg items-center justify-center transition">
                  {collapsed ? '▶' : '◀'}
                </button>
                {/* Close drawer (mobile) */}
                <button onClick={() => setMobileOpen(false)}
                  className="md:hidden text-ink-400 hover:text-ink-700 text-lg w-8 h-8 rounded-md hover:bg-cream-bg flex items-center justify-center transition">
                  ✕
                </button>
              </div>
              <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
                {NAV.map(n => {
                  const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
                  return (
                    <Link key={n.href} href={n.href}
                      className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm transition-colors group
                        ${active ? 'bg-rose-50 text-rose-700 font-medium' : 'text-ink-500 hover:bg-cream-bg hover:text-ink-800'}`}>
                      <span className="text-lg w-5 text-center">{n.icon}</span>
                      <span className={hideWhenCollapsed}>{n.label}</span>
                      {active && <span className={`ml-auto w-1 h-5 rounded-full bg-rose-500 ${hideWhenCollapsed}`} />}
                    </Link>
                  )
                })}
              </nav>
              <div className={`p-4 border-t border-ink-100 ${hideWhenCollapsed}`}>
                <p className="text-[10px] uppercase tracking-wider text-ink-300">Neko Salon</p>
                <p className="text-xs text-ink-500 mt-0.5">2 branches • v1.0</p>
              </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col h-full">
              {/* Mobile top bar with hamburger */}
              <header className="md:hidden h-14 shrink-0 flex items-center gap-3 px-4 border-b border-ink-100 bg-white">
                <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
                  className="text-2xl text-ink-600 hover:text-rose-500 w-9 h-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-cream-bg transition">
                  ☰
                </button>
                <p className="display text-lg text-ink-800 leading-none">
                  Neko <span className="text-[10px] uppercase tracking-[0.18em] text-rose-500 align-middle">Salon</span>
                </p>
              </header>

              <main className={`flex-1 min-w-0 ${isConversations ? 'overflow-hidden' : 'overflow-auto'}`}>
                <Suspense fallback={<div className="p-8 text-center text-ink-300">Loading…</div>}>
                  {children}
                </Suspense>
              </main>
            </div>
          </div>
        </AuthGate>
      </body>
    </html>
  )
}
