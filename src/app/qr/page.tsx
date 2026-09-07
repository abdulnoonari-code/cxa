import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentProject } from '@/lib/project'
import { loadSubjectIndex } from '@/data/subjects'
import { subjectLabel, type Subject } from '@/lib/subjects'
import { originFrom, targetUrl, qrSvg, fluid, LABEL_SIZES, labelSize, scanNote } from '@/lib/qr'

export const dynamic = 'force-dynamic'

// What may be labelled. Everything the subject spine knows about except the
// project itself — a QR code for "the whole project" is a code with nowhere
// useful to be stuck.
const SCOPES = [
  { value: 'system', label: 'Systems', note: 'One label per system — for the switchroom door, the panel schedule, the front of the board.' },
  { value: 'subsystem', label: 'Subsystems', note: 'One per bay or train.' },
  { value: 'equipment', label: 'Equipment', note: 'One per tagged item. This is the sheet most jobs print.' },
  { value: 'component', label: 'Parts', note: 'One per part inside an item — each cubicle, each CT.' },
  { value: 'area', label: 'Areas', note: 'One per room or zone.' },
  { value: 'site', label: 'Sites', note: 'One per site.' },
] as const

export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; size?: string; q?: string }>
}) {
  const { scope: scopeParam, size: sizeParam, q } = await searchParams
  const scope = SCOPES.find((s) => s.value === scopeParam)?.value ?? 'equipment'
  const size = labelSize(sizeParam)

  const project = await getCurrentProject()
  const origin = originFrom(await headers())
  const index = await loadSubjectIndex(project?.id ?? null)

  // The index is a map keyed by "type:id"; the values are every subject on
  // the project, which is what this page wants.
  const everything: Subject[] = [...index.byKey.values()]
  const all: Subject[] = everything.filter((s) => s.type === scope)
  const needle = (q ?? '').trim().toLowerCase()
  const subjects = needle
    ? all.filter((s) => `${s.code ?? ''} ${s.name}`.toLowerCase().includes(needle))
    : all

  // A cap, and it is said out loud rather than silently trimming. Six hundred
  // codes is already twenty-five sheets of paper; a project with four
  // thousand tags would otherwise render for a minute and print a ream.
  const CAP = 600
  const shown = subjects.slice(0, CAP)

  // Rendered on the server, in one pass. Each code is a few hundred bytes of
  // SVG, so the page carries its own images and there is nothing to fetch —
  // which also means it prints correctly from a phone with no signal.
  const codes = await Promise.all(
    shown.map(async (s) => ({
      subject: s,
      svg: origin ? fluid(await qrSvg(targetUrl(origin, s), 256)) : null,
    }))
  )

  return (
    <>
      <div className="no-print">
        <h1 className="page-title">QR labels</h1>
        <p className="page-subtitle">
          {project ? project.name : 'No project selected'} — printable codes for the plant. Each one opens that
          item&rsquo;s own page: its checks, its punch items, its documents. Scanned with the ordinary camera app,
          no reader to install.
        </p>

        {!origin && (
          <div className="alert alert-danger">
            <strong>Codes cannot be generated.</strong> The site address could not be read from this request, and a
            label with the wrong address on it is worse than no label — it would be stuck to plant and point
            nowhere for the life of the job.
          </div>
        )}

        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            What to print
          </h2>
          <form method="get" action="/qr">
            <div className="qr-scopes">
              {SCOPES.map((s) => {
                const n = everything.filter((x) => x.type === s.value).length
                return (
                  <label key={s.value} className={`qr-scope${s.value === scope ? ' is-on' : ''}`}>
                    <input type="radio" name="scope" value={s.value} defaultChecked={s.value === scope} />
                    <span>
                      <span className="qr-scope-label">
                        {s.label}
                        <span className="qr-scope-count">{n}</span>
                      </span>
                      <span className="qr-scope-note">{s.note}</span>
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="io-bar" style={{ marginTop: 16 }}>
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Only tags containing…"
                className="input"
                style={{ width: 'auto', flex: '1 1 220px', height: 38 }}
              />
              <select name="size" defaultValue={size.value} className="input" style={{ width: 'auto', height: 38 }}>
                {LABEL_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">
                Show
              </button>
            </div>
          </form>

          <p className="io-note">
            {subjects.length === 0
              ? 'Nothing to label yet in this group.'
              : `${subjects.length} label${subjects.length === 1 ? '' : 's'}${
                  subjects.length > CAP ? ` — showing the first ${CAP}` : ''
                }. Print this page, or save it as a PDF from the print dialog. Everything except the labels is left off the paper.`}
          </p>
        </div>

        {subjects.length > CAP && (
          <div className="alert alert-warning">
            <strong>{subjects.length} would be {Math.ceil(subjects.length / (size.perRow * 6))} sheets or more.</strong>{' '}
            The first {CAP} are shown. Narrow it with the search box above and print in batches — by system, or by
            the first part of the tag.
          </div>
        )}
      </div>

      <div className={`qr-sheet qr-sheet-${size.value}`}>
        {codes.map(({ subject, svg }) => (
          <div key={`${subject.type}:${subject.id}`} className="qr-label">
            <div className="qr-label-code">
              {svg ? (
                <span dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <span className="qr-label-missing">no address</span>
              )}
            </div>
            <div className="qr-label-text">
              {/* The tag, large. A label whose only content is a QR code is
                  useless the moment a phone is flat, and the person sticking
                  it on has to read it to know where it goes. */}
              <div className="qr-label-tag mono">{subject.code ?? subject.name}</div>
              {subject.code && subject.name !== subject.code && (
                <div className="qr-label-name">{subject.name}</div>
              )}
              <div className="qr-label-kind">{subjectLabel(subject.type)}</div>
            </div>
          </div>
        ))}
      </div>

      {codes.length > 0 && (
        <p className="qr-footer">
          {project?.name ?? ''} · {scanNote(origin)}
        </p>
      )}

      {codes.length === 0 && (
        <div className="card no-print">
          <p className="text-secondary" style={{ margin: 0, fontSize: 13.5 }}>
            Nothing here to label yet.{' '}
            <Link href="/equipment" className="link">
              Import your tag list
            </Link>{' '}
            and the codes appear by themselves — there is nothing to generate and nothing stored.
          </p>
        </div>
      )}
    </>
  )
}
