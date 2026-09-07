import { PANELS, panelSummary, isStandard, type PanelId } from '@/lib/dashboard-panels'
import { saveDashboardPanels, resetDashboardPanels } from '@/app/dashboard/actions'

/**
 * "Choose what you see."
 *
 * Closed by default and one line tall, because a chooser that takes up the
 * top of the screen has made the page busier in the name of making it
 * simpler.
 *
 * Every option carries the sentence that says what it answers. A tick box
 * labelled only "Gates" makes somebody guess; the guess is usually wrong,
 * and they leave everything on, which is the state this is meant to fix.
 */
export default function PanelChooser({ chosen }: { chosen: PanelId[] }) {
  const standard = isStandard(chosen)

  return (
    <details className="panel-chooser">
      <summary>
        <span className="panel-chooser-count">{panelSummary(chosen)}</span>
        <span className="panel-chooser-cue">Choose what you see</span>
      </summary>

      <form action={saveDashboardPanels} className="panel-chooser-body">
        <p className="text-secondary" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
          Nothing is deleted by unticking it — every panel is still one tick away, and the screen it summarises is
          unchanged. The choice is kept in this browser.
        </p>

        <div className="panel-choices">
          {PANELS.map((p) => (
            <label key={p.id} className="panel-choice">
              <input
                type="checkbox"
                name={`panel_${p.id}`}
                defaultChecked={chosen.includes(p.id)}
              />
              <span>
                <span className="panel-choice-label">
                  {p.label}
                  {p.standard && <span className="panel-choice-tag">standard</span>}
                </span>
                <span className="panel-choice-means">{p.means}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="io-bar" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          {!standard && (
            <button type="submit" formAction={resetDashboardPanels} className="btn btn-secondary">
              Back to the standard four
            </button>
          )}
        </div>
      </form>
    </details>
  )
}
