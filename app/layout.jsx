'use client'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, Suspense } from 'react'
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

  return (
    <html lang="en">
      <head>
        <title>Neko Salon — Studio Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body className="flex h-screen overflow-hidden">
        <AuthGate>
          <aside className={`${collapsed ? 'w-20' : 'w-60'} bg-white border-r border-ink-100 flex flex-col transition-all duration-300 shrink-0`}>
            <div className="h-20 flex items-center px-5 border-b border-ink-100">
              {!collapsed && (
                <div className="flex-1">
                  <p className="display text-xl text-ink-800 leading-tight">Neko</p>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-rose-500">Salon Studio</p>
                </div>
              )}
              <button onClick={() => setCollapsed(!collapsed)}
                className="text-ink-300 hover:text-ink-600 text-sm w-7 h-7 rounded-md hover:bg-cream-bg flex items-center justify-center transition">
                {collapsed ? '▶' : '◀'}
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
                    {!collapsed && <span>{n.label}</span>}
                    {active && !collapsed && <span className="ml-auto w-1 h-5 rounded-full bg-rose-500" />}
                  </Link>
                )
              })}
            </nav>
            <div className="p-4 border-t border-ink-100">
              {!collapsed && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-ink-300">Neko Salon</p>
                  <p className="text-xs text-ink-500 mt-0.5">2 branches • v1.0</p>
                </>
              )}
            </div>
          </aside>
          <main className={`flex-1 min-w-0 ${pathname.startsWith('/conversations') ? 'overflow-hidden' : 'overflow-auto'}`}>
            <Suspense fallback={<div className="p-8 text-center text-ink-300">Loading…</div>}>
              {children}
            </Suspense>
          </main>
        </AuthGate>
      </body>
    </html>
  )
}
