-- ═══════════════════════════════════════════════════════════════════════
-- CxSentinel — Week 5, part 42
-- WHAT MUST BE DONE ABOUT IT
-- ═══════════════════════════════════════════════════════════════════════
--
-- ─── WHAT IS MISSING RIGHT NOW ─────────────────────────────────────────
--
-- A punch item records what is WRONG in three ways and what must be DONE
-- in none:
--
--     title, description     what was seen          written by a person
--     severity, category     how much it matters    decided by a person
--     responsible_party      whose job it is        agreed with a party
--     due_date               by when                agreed with a party
--     ai_recommendation      what might fix it      GUESSED BY A MACHINE
--
-- So the only place in this database holding a remedy is a column filled
-- in by a language model looking at a photograph. That is a prompt to go
-- and look at something. It is not an instruction, it was not agreed with
-- anybody, and it must never be printed on a document issued to a
-- contractor as though it were.
--
-- Which is why a defect report could not be written until this file ran.
-- A report that lists forty defects and says nothing about what to do
-- about any of them is a list of complaints, and the contractor's first
-- reply is an email asking what is actually being asked for.
--
-- ─── WHAT THIS DOES ────────────────────────────────────────────────────
--
-- Adds three nullable columns to `issues`:
--
--     required_action   text          what must be done, in words
--     action_set_by     text          who wrote that, by name
--     action_set_at     timestamptz   when they wrote it
--
-- The last two are not bookkeeping. They are what lets a document say
--
--     "Agreed action, recorded by A. Jabbar on 14 Sep 2026"
--
-- for one item and
--
--     "No action agreed. An AI reading of the photograph suggests … —
--      a suggestion, not an instruction, and nobody has agreed it."
--
-- for the next, on the same page, without the reader having to guess which
-- is which. A document that cannot tell those two apart is worse than one
-- that carries no remedies at all.
--
-- It changes NO existing row. Every punch item on record keeps
-- required_action NULL, which reads as "nobody has said what to do yet" —
-- which is the truth about every one of them.
--
-- Nothing is renamed, nothing is dropped, nothing is backfilled. In
-- particular ai_recommendation is LEFT EXACTLY AS IT IS: the machine's
-- reading and the agreed remedy are two different facts and this file
-- refuses to turn one into the other.
--
-- Safe to run twice. Safe to run while people are using the site.
--
-- ─── RUN THIS WHOLE FILE ───────────────────────────────────────────────
-- Supabase → SQL Editor → paste → Run. The last statement prints a report.
-- ═══════════════════════════════════════════════════════════════════════


-- ─── 1. THE COLUMNS ────────────────────────────────────────────────────

ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS required_action text;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS action_set_by   text;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS action_set_at   timestamp with time zone;


-- ─── 2. THE INDEX ──────────────────────────────────────────────────────
--
-- Partial, on purpose. The question the application asks is "which items
-- on this project have nobody said what to do about" — and it asks it on
-- every defect report and at the top of the phone screen. Today that is
-- every row, and an index over a column that is entirely NULL is write
-- cost for no read. This one holds only the items somebody has answered,
-- which is the set that grows.

CREATE INDEX IF NOT EXISTS issues_action_idx
    ON public.issues (project_id, action_set_at)
 WHERE required_action IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- THE REPORT — read-only. One query, because the editor shows you only the
-- result of the last statement it ran.
-- ═══════════════════════════════════════════════════════════════════════

SELECT c.column_name                                       AS column_name,
       CASE WHEN EXISTS (
              SELECT 1 FROM information_schema.columns x
               WHERE x.table_schema = 'public'
                 AND x.table_name  = 'issues'
                 AND x.column_name = c.column_name)
            THEN 'YES' ELSE 'NO — this file did not finish' END AS in_place
  FROM (VALUES ('required_action'), ('action_set_by'), ('action_set_at'))
       AS c(column_name)
UNION ALL
SELECT 'index issues_action_idx',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_indexes i
               WHERE i.schemaname = 'public'
                 AND i.indexname  = 'issues_action_idx')
            THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'punch items on record', (SELECT count(*)::text FROM public.issues)
UNION ALL
SELECT 'of those, changed by this file', '0 — every existing row keeps required_action NULL'
UNION ALL
SELECT 'ai_recommendation', 'untouched — a machine reading is not an agreed action';
-- ═══════════════════════════════════════════════════════════════════════
--
-- ─── TO UNDO IT ────────────────────────────────────────────────────────
--
-- Only if something is badly wrong. This loses every remedy anybody has
-- written since. It loses no punch item, no photograph and no history.
--
--   ALTER TABLE public.issues DROP COLUMN IF EXISTS required_action;
--   ALTER TABLE public.issues DROP COLUMN IF EXISTS action_set_by;
--   ALTER TABLE public.issues DROP COLUMN IF EXISTS action_set_at;
--
-- ═══════════════════════════════════════════════════════════════════════
