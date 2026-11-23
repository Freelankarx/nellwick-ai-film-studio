-- NELLWICK AI planning job traceability.
-- Additive migration: safe to apply to the existing 0001 schema.
BEGIN;

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS generated_by_job_id uuid
  REFERENCES public.production_jobs(id) ON DELETE SET NULL;

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS generated_by_job_id uuid
  REFERENCES public.production_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scenes_generated_by_job_idx
  ON public.scenes(generated_by_job_id)
  WHERE generated_by_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shots_generated_by_job_idx
  ON public.shots(generated_by_job_id)
  WHERE generated_by_job_id IS NOT NULL;

COMMIT;
