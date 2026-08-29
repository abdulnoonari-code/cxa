import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  taskStatusBadgeClass,
  priorityBadgeClass,
  isTaskOverdue,
} from '@/lib/tasks'
import { createTask, updateTask, deleteTask } from './actions'

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string }>
}) {
  const { status: statusFilter, assignee: assigneeFilter } = await searchParams
  const project = await getCurrentProject()

  let query = supabase
    .from('tasks')
    .select('id, title, description, assignee, due_date, status, priority')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (project) query = query.eq('project_id', project.id)
  if (statusFilter) query = query.eq('status', statusFilter)
  if (assigneeFilter) query = query.eq('assignee', assigneeFilter)

  const { data: tasksRaw } = project ? await query : { data: [] }
  const tasks = tasksRaw ?? []

  const { data: allRaw } = project
    ? await supabase.from('tasks').select('assignee, status, due_date').eq('project_id', project.id)
    : { data: [] as { assignee: string | null; status: string; due_date: string | null }[] }

  const all = allRaw ?? []
  const people = Array.from(new Set(all.map((t) => t.assignee).filter((a): a is string => Boolean(a)))).sort()

  const openCount = all.filter((t) => t.status !== 'done').length
  const overdueCount = all.filter((t) => isTaskOverdue(t.due_date, t.status)).length
  const doneCount = all.filter((t) => t.status === 'done').length
  const donePercent = all.length > 0 ? Math.round((doneCount / all.length) * 100) : 0

  return (
    <>
      <h1 className="page-title">Tasks</h1>
      <p className="page-subtitle">
        {project ? project.name : 'No project selected'} — who owes what, and by when. Separate from the punch
        list: a task is work to be done, a punch list item is a defect found.
      </p>

      <div className="stat-grid">
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <div className="stat-label">Open</div>
          <div className="stat-value">{openCount}</div>
          <div className="stat-note">{all.length} in total</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-danger-solid)' }}>
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{overdueCount}</div>
          <div className="stat-note">{overdueCount === 0 ? 'Nothing past its date' : 'Past the due date'}</div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-success-solid)' }}>
          <div className="stat-label">Complete</div>
          <div className="stat-value">{donePercent}%</div>
          <div className="stat-note">
            {doneCount} of {all.length} done
          </div>
        </div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--color-warning-solid)' }}>
          <div className="stat-label">People</div>
          <div className="stat-value">{people.length}</div>
          <div className="stat-note">{people.length > 0 ? people.slice(0, 3).join(', ') : 'Nobody assigned yet'}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">New task</h2>
        <form action={createTask} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Task *
            <input name="title" required placeholder="e.g. Chase vendor for GEN-01 load bank report" className="input" />
          </label>
          <label className="field">
            Assigned to
            <input name="assignee" placeholder="Name" className="input" list="cx-people" />
            <datalist id="cx-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Due date
            <input type="date" name="due_date" className="input" />
          </label>
          <label className="field">
            Priority
            <select name="priority" className="input" defaultValue="normal">
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Status
            <select name="status" className="input" defaultValue="open">
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Detail
            <input name="description" placeholder="What needs to happen" className="input" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Add task
            </button>
          </div>
        </form>
      </div>

      <div style={{ margin: '24px 0 16px' }}>
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="status" defaultValue={statusFilter ?? ''} className="input" style={{ maxWidth: 200 }}>
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="assignee" defaultValue={assigneeFilter ?? ''} className="input" style={{ maxWidth: 220 }}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Priority</th>
              <th>Status</th>
              <th style={{ minWidth: 300 }}>Update</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length > 0 ? (
              tasks.map((t) => {
                const overdue = isTaskOverdue(t.due_date, t.status)
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      {t.description && (
                        <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                          {t.description}
                        </div>
                      )}
                    </td>
                    <td>{t.assignee ?? <span className="text-secondary">Unassigned</span>}</td>
                    <td>
                      <span className="mono" style={{ fontSize: 12.5 }}>
                        {t.due_date ?? '—'}
                      </span>
                      {overdue && (
                        <div>
                          <span className="badge badge-danger" style={{ marginTop: 4 }}>
                            Overdue
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={priorityBadgeClass(t.priority)}>{t.priority}</span>
                    </td>
                    <td>
                      <span className={taskStatusBadgeClass(t.status)}>
                        {TASK_STATUSES.find((s) => s.value === t.status)?.label ?? t.status}
                      </span>
                    </td>
                    <td>
                      <form
                        style={{
                          display: 'grid',
                          gap: 8,
                          gridTemplateColumns: '1fr 1fr auto auto',
                          alignItems: 'center',
                        }}
                      >
                        <input type="hidden" name="id" value={t.id} />
                        <select key={`s-${t.id}-${t.status}`} name="status" defaultValue={t.status} className="input">
                          {TASK_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <input
                          key={`d-${t.id}-${t.due_date ?? ''}`}
                          type="date"
                          name="due_date"
                          defaultValue={t.due_date ?? ''}
                          className="input"
                        />
                        <input type="hidden" name="assignee" value={t.assignee ?? ''} />
                        <input type="hidden" name="priority" value={t.priority} />
                        <button formAction={updateTask} type="submit" className="btn btn-secondary btn-sm">
                          Save
                        </button>
                        <button formAction={deleteTask} type="submit" className="btn-link">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No tasks yet — add the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
