import { supabase } from '@/lib/supabase'
import { getCurrentProject } from '@/lib/project'
import { calibrationStatus, calibrationBadgeClass, calibrationLabel } from '@/lib/tests'
import { createInstrument, updateInstrument, deleteInstrument } from './actions'

export const dynamic = 'force-dynamic'

export default async function InstrumentsPage() {
  const project = await getCurrentProject()

  const { data: rows } = project
    ? await supabase
        .from('instruments')
        .select('id, instrument_id, name, manufacturer, model, serial_number, cert_number, calibration_date, calibration_expiry')
        .eq('project_id', project.id)
        .order('instrument_id')
    : {
        data: [] as {
          id: string
          instrument_id: string
          name: string | null
          manufacturer: string | null
          model: string | null
          serial_number: string | null
          cert_number: string | null
          calibration_date: string | null
          calibration_expiry: string | null
        }[],
      }

  const instruments = rows ?? []
  const withState = instruments.map((i) => ({ ...i, state: calibrationStatus(i.calibration_expiry) }))
  const expired = withState.filter((i) => i.state === 'expired').length
  const expiring = withState.filter((i) => i.state === 'expiring').length

  return (
    <>
      <h1 className="page-title">Test Instruments</h1>
      <p className="page-subtitle" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {project ? project.name : 'No project selected'} — the calibration register. A test result recorded on
          an out-of-calibration instrument cannot be accepted.
        </span>
        {expired > 0 && <span className="badge badge-danger">{expired} expired</span>}
        {expiring > 0 && <span className="badge badge-warning">{expiring} expiring soon</span>}
      </p>

      <div className="card">
        <h2 className="section-title">Add an instrument</h2>
        <form action={createInstrument} style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <input type="hidden" name="project_id" value={project?.id ?? ''} />
          <label className="field">
            Instrument ID *
            <input name="instrument_id" required placeholder="e.g. MTR-004" className="input" />
          </label>
          <label className="field">
            Type
            <input name="name" placeholder="e.g. Micro-ohmmeter" className="input" />
          </label>
          <label className="field">
            Serial number
            <input name="serial_number" className="input" />
          </label>
          <label className="field">
            Manufacturer
            <input name="manufacturer" placeholder="e.g. Megger" className="input" />
          </label>
          <label className="field">
            Model
            <input name="model" className="input" />
          </label>
          <label className="field">
            Certificate number
            <input name="cert_number" className="input" />
          </label>
          <label className="field">
            Calibrated on
            <input type="date" name="calibration_date" className="input" />
          </label>
          <label className="field">
            Calibration expires
            <input type="date" name="calibration_expiry" className="input" />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary" disabled={!project}>
              Add instrument
            </button>
          </div>
        </form>
      </div>

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Make &amp; model</th>
              <th>Serial</th>
              <th>Certificate</th>
              <th>Calibration</th>
              <th style={{ minWidth: 300 }}>Update certificate</th>
            </tr>
          </thead>
          <tbody>
            {withState.length > 0 ? (
              withState.map((i) => (
                <tr key={i.id}>
                  <td>
                    <div className="mono" style={{ fontWeight: 600 }}>
                      {i.instrument_id}
                    </div>
                    {i.name && (
                      <div className="text-secondary" style={{ fontSize: 12.5 }}>
                        {i.name}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13.5 }}>{[i.manufacturer, i.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {i.serial_number ?? '—'}
                  </td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {i.cert_number ?? '—'}
                  </td>
                  <td>
                    <span className={calibrationBadgeClass(i.state)}>{calibrationLabel(i.state)}</span>
                    {i.calibration_expiry && (
                      <div className="text-secondary mono" style={{ fontSize: 11.5, marginTop: 4 }}>
                        to {i.calibration_expiry}
                      </div>
                    )}
                  </td>
                  <td>
                    <form
                      style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr auto auto', alignItems: 'center' }}
                    >
                      <input type="hidden" name="id" value={i.id} />
                      <input
                        key={`c-${i.id}-${i.cert_number ?? ''}`}
                        name="cert_number"
                        defaultValue={i.cert_number ?? ''}
                        placeholder="Cert no."
                        className="input"
                      />
                      <input
                        key={`e-${i.id}-${i.calibration_expiry ?? ''}`}
                        type="date"
                        name="calibration_expiry"
                        defaultValue={i.calibration_expiry ?? ''}
                        className="input"
                      />
                      <input type="hidden" name="calibration_date" value={i.calibration_date ?? ''} />
                      <button formAction={updateInstrument} type="submit" className="btn btn-secondary btn-sm">
                        Save
                      </button>
                      <button formAction={deleteInstrument} type="submit" className="btn-link">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No instruments yet — add the meters and testers you use on this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
