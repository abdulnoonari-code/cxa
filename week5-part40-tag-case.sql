-- ═══════════════════════════════════════════════════════════════════════
-- CxSentinel — Week 5, part 40
-- ONE TAG, ONE SPELLING
-- ═══════════════════════════════════════════════════════════════════════
--
-- ─── WHAT IS WRONG RIGHT NOW ───────────────────────────────────────────
--
-- The equipment register has a unique rule on (project_id, tag_id). It is
-- case-SENSITIVE, because that is what a plain UNIQUE constraint on a text
-- column means. So the database is perfectly happy to hold
--
--     TX-01
--     tx-01
--     Tx-01
--
-- as three different pieces of plant on one project.
--
-- Nobody in commissioning thinks those are three transformers, and neither
-- does this application: every importer, every matcher and every lookup in
-- the code compares tags in lower case. So the two disagree, and the
-- disagreement is silent.
--
-- What it costs: an import builds a map of existing tags keyed on lower
-- case. If the register holds two spellings, that map keeps ONE of them.
-- The other row becomes invisible to every import from then on — an update
-- meant for it lands on its twin, overwrites the twin's values with the
-- wrong row's, and nothing anywhere reports it.
--
-- ─── EVERY OTHER TABLE ALREADY DOES THIS ───────────────────────────────
--
-- This is not a new idea being introduced. It is the one place the rule was
-- missed. Already case-insensitive today:
--
--     components.components_tag_unique          (equipment_id, lower(tag_id))
--     equipment_types.equipment_types_code_unique (project_id, lower(type_code))
--     project_members.project_members_unique_email (project_id, lower(email))
--     project_roles.project_roles_unique_key     (project_id, lower(role_key))
--
-- Equipment — the busiest table in the application — is the exception.
--
-- ─── WHAT THIS DOES, AND DOES NOT DO ───────────────────────────────────
--
-- It replaces the case-sensitive rule with a case-insensitive one. It does
-- NOT rename, merge or delete a single row. Your tags keep their exact
-- spelling; the database simply stops accepting a second row that differs
-- only in case.
--
-- IT REFUSES TO RUN IF YOUR REGISTER ALREADY HOLDS A CLASH. Silently
-- merging two rows would be choosing which engineer's record survives, and
-- that is not a decision a migration gets to make. If there are clashes it
-- changes nothing, leaves the old rule exactly as it was, and the report at
-- the bottom names them so you can decide.
--
-- Safe to run twice.
--
-- ─── RUN THIS WHOLE FILE ───────────────────────────────────────────────
-- Supabase → SQL Editor → paste → Run. The last statement prints a report.
-- ═══════════════════════════════════════════════════════════════════════


-- ─── 1. LOOK FIRST ─────────────────────────────────────────────────────
--
-- Any tag on any project recorded under more than one spelling.

SELECT project_id,
       lower(tag_id)                        AS the_tag,
       count(*)                             AS rows_found,
       string_agg(tag_id, ' / ' ORDER BY tag_id) AS spellings
  FROM public.equipment
 GROUP BY project_id, lower(tag_id)
HAVING count(*) > 1;


-- ─── 2. SWAP THE RULE, ONLY IF IT IS SAFE ──────────────────────────────

DO $$
DECLARE
  clashes integer;
BEGIN
  SELECT count(*) INTO clashes
    FROM (
      SELECT 1
        FROM public.equipment
       GROUP BY project_id, lower(tag_id)
      HAVING count(*) > 1
    ) AS d;

  IF clashes > 0 THEN
    RAISE NOTICE 'NOTHING CHANGED. % tag(s) are already recorded under more than one spelling. The query above names them. Decide which row is the real one, delete or rename the other, then run this file again.', clashes;
    RETURN;
  END IF;

  -- The new rule first, so there is never a moment with no rule at all.
  CREATE UNIQUE INDEX IF NOT EXISTS equipment_tag_unique_ci
      ON public.equipment (project_id, lower(tag_id));

  -- Then the old one goes. Dropping the constraint drops the index behind
  -- it; nothing has a foreign key pointing at it.
  ALTER TABLE public.equipment
    DROP CONSTRAINT IF EXISTS equipment_project_id_tag_id_key;

  -- And the plain duplicate of it, which never earned its write cost: the
  -- unique index above already answers every query this one did.
  DROP INDEX IF EXISTS public.equipment_project_tag_idx;

  RAISE NOTICE 'Done. TX-01 and tx-01 are now the same tag to the database, as they always were to the application.';
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- THE REPORT — read-only. One query, because the editor shows you only the
-- result of the last statement it ran.
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'the new case-insensitive rule is in place' AS thing,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND indexname = 'equipment_tag_unique_ci')
            THEN 'YES' ELSE 'NO — see the notice above' END AS answer
UNION ALL
SELECT 'the old case-sensitive rule is gone',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'equipment_project_id_tag_id_key')
            THEN 'no — still there' ELSE 'YES' END
UNION ALL
SELECT 'tags recorded under more than one spelling',
       COALESCE((SELECT count(*)::text FROM (
                   SELECT 1 FROM public.equipment
                    GROUP BY project_id, lower(tag_id) HAVING count(*) > 1) d), '0')
UNION ALL
SELECT 'tags in the register',
       (SELECT count(*)::text FROM public.equipment);
-- ═══════════════════════════════════════════════════════════════════════
--
-- ─── TO UNDO IT ────────────────────────────────────────────────────────
--
--   ALTER TABLE public.equipment
--     ADD CONSTRAINT equipment_project_id_tag_id_key UNIQUE (project_id, tag_id);
--   DROP INDEX IF EXISTS public.equipment_tag_unique_ci;
--
-- ═══════════════════════════════════════════════════════════════════════
