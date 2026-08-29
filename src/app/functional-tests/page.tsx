import { LevelChecklistView } from '@/components/LevelChecklistView'

export const dynamic = 'force-dynamic'

export default function FunctionalTestsPage() {
  return (
    <LevelChecklistView
      level="L4_fpt"
      title="Functional Tests"
      blurb="Every L4 — Functional Performance Test item, across all equipment, in one list."
    />
  )
}
