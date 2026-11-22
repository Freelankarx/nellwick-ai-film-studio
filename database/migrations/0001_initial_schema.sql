-- NELLWICK AI FILM STUDIO
-- Fresh-project setup for Supabase PostgreSQL.
-- Apply ONCE to a newly created Supabase project using the SQL Editor.
-- This script is transactional: a failure rolls back the database setup.

BEGIN;

-- -----------------------------------------------------------------------------
-- Shared trigger helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Core creative workspace
-- -----------------------------------------------------------------------------
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  project_type text NOT NULL DEFAULT 'film'
    CHECK (project_type IN ('film','series','advertisement','documentary','social','other')),
  aspect_ratio text NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9','9:16','1:1','4:5')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX projects_owner_updated_idx
  ON public.projects(owner_id, updated_at DESC);

CREATE TABLE public.episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  synopsis text NOT NULL DEFAULT '',
  script_markdown text NOT NULL DEFAULT '',
  target_duration_seconds integer CHECK (target_duration_seconds IS NULL OR target_duration_seconds > 0),
  aspect_ratio text NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9','9:16','1:1','4:5')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planning','approved','queued','processing','completed','archived')),
  production_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX episodes_project_idx ON public.episodes(project_id, created_at DESC);
CREATE INDEX episodes_owner_idx ON public.episodes(owner_id, updated_at DESC);

CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  canonical_description text NOT NULL DEFAULT '',
  visual_traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  wardrobe jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_asset_ids uuid[] NOT NULL DEFAULT '{}',
  continuity_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX characters_project_idx ON public.characters(project_id);
CREATE INDEX characters_owner_idx ON public.characters(owner_id);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  visual_reference_ids uuid[] NOT NULL DEFAULT '{}',
  continuity_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX locations_project_idx ON public.locations(project_id);
CREATE INDEX locations_owner_idx ON public.locations(owner_id);

CREATE TABLE public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  scene_number integer NOT NULL CHECK (scene_number > 0),
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  script_excerpt text NOT NULL DEFAULT '',
  continuity_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (episode_id, scene_number)
);
CREATE INDEX scenes_episode_idx ON public.scenes(episode_id, scene_number);
CREATE INDEX scenes_owner_idx ON public.scenes(owner_id);

CREATE TABLE public.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_number integer NOT NULL CHECK (shot_number > 0),
  prompt text NOT NULL DEFAULT '',
  negative_prompt text NOT NULL DEFAULT '',
  camera jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_description text NOT NULL DEFAULT '',
  duration_seconds numeric(6,2) NOT NULL DEFAULT 5 CHECK (duration_seconds > 0),
  aspect_ratio text NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9','9:16','1:1','4:5')),
  generation_mode text NOT NULL DEFAULT 'text_to_video',
  model_id text NOT NULL DEFAULT 'wan21-t2v-1.3b',
  generation_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  output_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (scene_id, shot_number)
);
CREATE INDEX shots_scene_idx ON public.shots(scene_id, shot_number);
CREATE INDEX shots_owner_idx ON public.shots(owner_id);

-- -----------------------------------------------------------------------------
-- Media library and production queue
-- -----------------------------------------------------------------------------
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  source_type text NOT NULL DEFAULT 'uploaded'
    CHECK (source_type IN ('uploaded','generated','rendered','imported')),
  storage_provider text NOT NULL DEFAULT 'google_drive'
    CHECK (storage_provider IN ('google_drive','supabase','local','external')),
  drive_file_id text,
  drive_path text,
  supabase_bucket text,
  supabase_path text,
  thumbnail_asset_id uuid,
  tags text[] NOT NULL DEFAULT '{}',
  is_favorite boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, owner_id),
  CONSTRAINT assets_thumbnail_owner_fk
    FOREIGN KEY (thumbnail_asset_id, owner_id)
    REFERENCES public.assets(id, owner_id)
);
CREATE INDEX assets_owner_created_idx
  ON public.assets(owner_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX assets_project_idx
  ON public.assets(project_id) WHERE deleted_at IS NULL;
CREATE INDEX assets_episode_idx
  ON public.assets(episode_id) WHERE deleted_at IS NULL;
CREATE INDEX assets_drive_file_idx
  ON public.assets(drive_file_id) WHERE drive_file_id IS NOT NULL;
CREATE INDEX assets_owner_trash_idx
  ON public.assets(owner_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;

ALTER TABLE public.shots
  ADD CONSTRAINT shots_output_asset_fk
  FOREIGN KEY (output_asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;

CREATE TABLE public.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  priority integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts >= 1),
  claimed_by text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at timestamptz
);
CREATE INDEX production_jobs_queue_idx
  ON public.production_jobs(status, priority DESC, created_at ASC);
CREATE INDEX production_jobs_owner_idx
  ON public.production_jobs(owner_id, created_at DESC);
CREATE INDEX production_jobs_lease_idx
  ON public.production_jobs(owner_id, lease_expires_at)
  WHERE status = 'processing';
CREATE UNIQUE INDEX production_jobs_idempotency_idx
  ON public.production_jobs(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Private server-only credentials and worker tokens
-- -----------------------------------------------------------------------------
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  root_folder_id text,
  account_label text,
  connected_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (owner_id, provider)
);
CREATE INDEX integrations_owner_idx ON public.integrations(owner_id);

CREATE TABLE public.worker_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'notebook-worker',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX worker_tokens_owner_idx
  ON public.worker_tokens(owner_id, expires_at DESC);

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX activity_log_owner_idx
  ON public.activity_log(owner_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'projects','episodes','characters','locations','scenes','shots',
    'assets','production_jobs','integrations'
  ] LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I',
      table_name, table_name
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Parent ownership is checked on writes, not just owner_id. This prevents a
-- user from attaching their rows to another user's projects/episodes/scenes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_owner_access ON public.projects;
CREATE POLICY projects_owner_access ON public.projects
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS episodes_owner_access ON public.episodes;
CREATE POLICY episodes_owner_access ON public.episodes
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS characters_owner_access ON public.characters;
CREATE POLICY characters_owner_access ON public.characters
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS locations_owner_access ON public.locations;
CREATE POLICY locations_owner_access ON public.locations
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS scenes_owner_access ON public.scenes;
CREATE POLICY scenes_owner_access ON public.scenes
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.episodes e
      WHERE e.id = episode_id AND e.owner_id = (SELECT auth.uid())
    )
    AND (
      location_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.locations l
        JOIN public.episodes e ON e.id = episode_id
        WHERE l.id = location_id
          AND l.owner_id = (SELECT auth.uid())
          AND l.project_id = e.project_id
      )
    )
  );

DROP POLICY IF EXISTS shots_owner_access ON public.shots;
CREATE POLICY shots_owner_access ON public.shots
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.scenes s
      WHERE s.id = scene_id AND s.owner_id = (SELECT auth.uid())
    )
    AND (
      output_asset_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.assets a
        WHERE a.id = output_asset_id AND a.owner_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS assets_owner_access ON public.assets;
CREATE POLICY assets_owner_access ON public.assets
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      )
    )
    AND (
      episode_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.episodes e
        WHERE e.id = episode_id
          AND e.owner_id = (SELECT auth.uid())
          AND (assets.project_id IS NULL OR e.project_id = assets.project_id)
      )
    )
  );

DROP POLICY IF EXISTS jobs_owner_access ON public.production_jobs;
CREATE POLICY jobs_owner_access ON public.production_jobs
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      )
    )
    AND (
      episode_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.episodes e
        WHERE e.id = episode_id
          AND e.owner_id = (SELECT auth.uid())
          AND (production_jobs.project_id IS NULL OR e.project_id = production_jobs.project_id)
      )
    )
  );

DROP POLICY IF EXISTS activity_owner_access ON public.activity_log;
CREATE POLICY activity_owner_access ON public.activity_log
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
      )
    )
  );

-- integrations and worker_tokens deliberately have no authenticated policies.
-- All reads/writes to those tables must go through protected server routes.

-- -----------------------------------------------------------------------------
-- Explicit API privileges: anon gets no application-table access; authenticated
-- gets CRUD only on user-owned tables, protected by the policies above.
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE
  public.projects, public.episodes, public.characters, public.locations,
  public.scenes, public.shots, public.assets, public.production_jobs,
  public.integrations, public.worker_tokens, public.activity_log
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.projects, public.episodes, public.characters, public.locations,
  public.scenes, public.shots, public.assets, public.production_jobs,
  public.activity_log
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.integrations, public.worker_tokens
TO service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- -----------------------------------------------------------------------------
-- Atomic worker job claim. The lease permits recovery after a worker disconnects.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_production_job(
  p_owner_id uuid,
  p_worker_label text
)
RETURNS SETOF public.production_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.production_jobs;
BEGIN
  -- Move jobs that exhausted all attempts and whose worker lease expired to failed.
  UPDATE public.production_jobs
  SET status = 'failed',
      lease_expires_at = NULL,
      last_error = COALESCE(last_error, 'Worker lease expired after maximum attempts.'),
      updated_at = pg_catalog.now()
  WHERE owner_id = p_owner_id
    AND status = 'processing'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < pg_catalog.now()
    AND attempt_count >= max_attempts;

  SELECT *
  INTO v_job
  FROM public.production_jobs
  WHERE owner_id = p_owner_id
    AND attempt_count < max_attempts
    AND (
      status = 'queued'
      OR (
        status = 'processing'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < pg_catalog.now()
      )
    )
  ORDER BY priority DESC, created_at ASC, id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.production_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_by = pg_catalog.left(COALESCE(p_worker_label, 'notebook-worker'), 80),
      lease_expires_at = pg_catalog.now() + INTERVAL '10 minutes',
      heartbeat_at = pg_catalog.now(),
      last_error = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_production_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_production_job(uuid, text)
  TO service_role;

-- -----------------------------------------------------------------------------
-- Private preview bucket. Full-resolution masters and long videos remain in Drive.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'studio-previews',
  'studio-previews',
  false,
  52428800,
  ARRAY['image/*','audio/*','video/mp4','application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS nellwick_preview_owner_access ON storage.objects;
CREATE POLICY nellwick_preview_owner_access ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'studio-previews'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'studio-previews'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- Fail-fast verification before committing the transaction
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'projects','episodes','characters','locations','scenes','shots','assets',
    'production_jobs','integrations','worker_tokens','activity_log'
  ];
  missing_tables text;
BEGIN
  SELECT pg_catalog.string_agg(t.table_name, ', ')
  INTO missing_tables
  FROM pg_catalog.unnest(expected_tables) AS t(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables s
    WHERE s.table_schema = 'public'
      AND s.table_name = t.table_name
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'NELLWICK setup verification failed. Missing tables: %', missing_tables;
  END IF;

  IF pg_catalog.to_regprocedure('public.claim_next_production_job(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'NELLWICK setup verification failed: worker claim function is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'studio-previews' AND public = false
  ) THEN
    RAISE EXCEPTION 'NELLWICK setup verification failed: private preview bucket is missing.';
  END IF;
END;
$$;

COMMIT;

-- Final verification report. Expected: 11 tables, RLS enabled on all 11,
-- 1 worker function and 1 private storage bucket.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'projects','episodes','characters','locations','scenes','shots','assets',
    'production_jobs','integrations','worker_tokens','activity_log'
  )
ORDER BY c.relname;

SELECT
  'claim_next_production_job' AS worker_function,
  (pg_catalog.to_regprocedure('public.claim_next_production_job(uuid,text)') IS NOT NULL) AS installed;

SELECT id, public AS is_public, file_size_limit
FROM storage.buckets
WHERE id = 'studio-previews';
