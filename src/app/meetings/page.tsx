import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { createMeeting, updateMeeting, deleteMeeting } from './actions'

export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const project = await getCurrentProject()

  const { data: meetingsRaw } = project
    ? await supabase
        .from('meetings')
        .select('id, title, meeting_date, attendees, notes, decisions')
        .eq('project_id', project.id)
        .order('meeting_date', { ascending: false, nullsFirst: false })
    : {
        data: [] as {
          id: string
          title: string
          meeting_date: string | null
          attendees: string | null
          notes: string | null
          decisions: string | null
        }[],
      }

  const meetings = meetingsRaw ?? []

  return (
    <>
      <h1 className="page-title">Meetings</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — commissioning meetings, who attended, and what was
        decided. The decision record is what matters later, when someone asks why a system was accepted.
      </p>

      <div className="card">
        <h2 className="section-title">Record a meeting</h2>
        <form action={createMeeting} style={{ display: 'grid', gap: 14, gridTemplateColumns: '2fr 1fr' }}>
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label className="field">
            Title *
            <input name="title" required placeholder="e.g. Weekly commissioning coordination" className="input" />
          </label>
          <label className="field">
            Date
            <input type="date" name="meeting_date" className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Attendees
            <input name="attendees" placeholder="Names, comma separated" className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Notes
            <textarea name="notes" rows={3} placeholder="What was discussed" className="input" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Decisions and actions
            <textarea
              name="decisions"
              rows={3}
              placeholder="What was agreed, and who owns each action"
              className="input"
            />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Save meeting
            </button>
          </div>
        </form>
      </div>

      {meetings.length > 0 ? (
        <div style={{ display: 'grid', gap: 14, marginTop: 22 }}>
          {meetings.map((m) => (
            <div key={m.id} className="card">
              <details>
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15.5 }}>{m.title}</div>
                      {m.attendees && (
                        <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 3 }}>
                          {m.attendees}
                        </div>
                      )}
                    </div>
                    <span className="mono text-secondary" style={{ fontSize: 12.5 }}>
                      {m.meeting_date ?? 'no date'}
                    </span>
                  </div>
                  {m.decisions && (
                    <p className="alert alert-info" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                      <strong>Decisions:</strong> {m.decisions}
                    </p>
                  )}
                </summary>

                <form action={updateMeeting} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  <input type="hidden" name="id" value={m.id} />
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
                    <label className="field">
                      Title
                      <input name="title" defaultValue={m.title} className="input" />
                    </label>
                    <label className="field">
                      Date
                      <input type="date" name="meeting_date" defaultValue={m.meeting_date ?? ''} className="input" />
                    </label>
                  </div>
                  <label className="field">
                    Attendees
                    <input name="attendees" defaultValue={m.attendees ?? ''} className="input" />
                  </label>
                  <label className="field">
                    Notes
                    <textarea name="notes" rows={3} defaultValue={m.notes ?? ''} className="input" />
                  </label>
                  <label className="field">
                    Decisions and actions
                    <textarea name="decisions" rows={3} defaultValue={m.decisions ?? ''} className="input" />
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Save changes
                    </button>
                    <button formAction={deleteMeeting} type="submit" className="btn btn-danger-outline btn-sm">
                      Delete
                    </button>
                  </div>
                </form>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 22 }}>
          <p className="text-secondary" style={{ fontSize: 14, marginBottom: 0 }}>
            No meetings recorded yet.
          </p>
        </div>
      )}
    </>
  )
}
