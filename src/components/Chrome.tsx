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

export function Chrome({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'

  if (BARE.has(pathname)) {
    return (
      <main className="app-shell">
        <div className="app-shell-inner">{children}</div>
      </main>
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
