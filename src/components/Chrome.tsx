'use client'

import { usePathname } from 'next/navigation'

// Which screens have no rail.
//
// The rail is a project's rail: twenty-one items that are all views of one
// project's records. On the screen where you are CHOOSING a project it is
// worse than useless — it is showing you the contents of whichever project
// happened to be open last, next to a list asking you which project you want,
// which is the state the last screenshot was taken in.
//
// So the choosing screens are bare and full width, and everything else is
// inside the rail. The test is simple: if the page does not belong to one
// project, it has no rail.
const BARE = new Set(['/', '/projects', '/login', '/signup', '/about'])

export function Chrome({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode
  topbar: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? '/'

  // Bare of the RAIL, not bare of everything. A page with no frame at all
  // reads as an unfinished page rather than a deliberate one.
  if (BARE.has(pathname)) {
    return (
      <div className="plain-layout">
        {topbar}
        <main className="plain-shell">{children}</main>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {sidebar}
      <main className="app-shell">
        <div className="app-shell-inner">{children}</div>
      </main>
    </div>
  )
}
