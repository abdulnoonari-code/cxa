import Link from 'next/link'
import { panel, type PanelId } from '@/lib/dashboard-panels'

/**
 * The head of a dashboard panel: what it is, what it means, and the screen
 * it came from.
 *
 * One component rather than nine hand-written headings, because the rule is
 * the same everywhere and a rule written nine times is a rule that will be
 * followed eight times. A figure on a dashboard with no definition beside it
 * gets read two ways by two people in the same meeting, and the link is what
 * lets somebody stop arguing about the number and go look at the records
 * behind it.
 */
export default function PanelHead({
  id,
  exportHref,
}: {
  id: PanelId
  /** A .csv of the figures behind this panel, where there is one. */
  exportHref?: string
}) {
  const p = panel(id)
  return (
    <div className="panel-head">
      <div className="panel-head-row">
        <h2 className="section-title" style={{ margin: 0 }}>
          {p.label}
        </h2>
        <div className="panel-head-links">
          {exportHref && (
            <a href={exportHref} className="link" download>
              Export
            </a>
          )}
          <Link href={p.href} className="link">
            {p.hrefLabel} →
          </Link>
        </div>
      </div>
      <p className="panel-head-means">{p.means}</p>
    </div>
  )
}
