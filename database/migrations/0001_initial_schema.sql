-- NELLWICK AI Film Studio: initial schema.
-- Apply this file in Supabase SQL Editor using a project created for this studio.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  project_type text not null default 'film' check (project_type in ('film','series','advertisement','documentary','social','other')),
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9','9:16','1:1','4:5')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_updated_idx on public.projects(owner_id, updated_at desc);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  synopsis text not null default '',
  script_markdown text not null default '',
  target_duration_seconds integer,
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9','9:16','1:1','4:5')),
  status text not null default 'draft' check (status in ('draft','planning','approved','queued','processing','completed','archived')),
  production_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists episodes_project_idx on public.episodes(project_id, created_at desc);
create index if not exists episodes_owner_idx on public.episodes(owner_id, updated_at desc);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role text not null default '',
  canonical_description text not null default '',
  visual_traits jsonb not null default '{}'::jsonb,
  wardrobe jsonb not null default '[]'::jsonb,
  voice_profile jsonb not null default '{}'::jsonb,
  reference_asset_ids uuid[] not null default '{}',
  continuity_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_project_idx on public.characters(project_id);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  visual_reference_ids uuid[] not null default '{}',
  continuity_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  scene_number integer not null,
  title text not null default '',
  summary text not null default '',
  location_id uuid references public.locations(id) on delete set null,
  script_excerpt text not null default '',
  continuity_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(episode_id, scene_number)
);

create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  shot_number integer not null,
  prompt text not null default '',
  negative_prompt text not null default '',
  camera jsonb not null default '{}'::jsonb,
  action_description text not null default '',
  duration_seconds numeric(6,2) not null default 5,
  aspect_ratio text not null default '16:9',
  generation_mode text not null default 'text_to_video',
  model_id text not null default 'wan21-t2v-1.3b',
  generation_settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  output_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scene_id, shot_number)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  episode_id uuid references public.episodes(id) on delete set null,
  name text not null,
  mime_type text,
  file_size bigint,
  source_type text not null default 'uploaded' check (source_type in ('uploaded','generated','rendered','imported')),
  storage_provider text not null default 'google_drive' check (storage_provider in ('google_drive','supabase','local','external')),
  drive_file_id text,
  drive_path text,
  supabase_bucket text,
  supabase_path text,
  thumbnail_asset_id uuid,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assets_owner_created_idx on public.assets(owner_id, created_at desc) where deleted_at is null;
create index if not exists assets_project_idx on public.assets(project_id) where deleted_at is null;
create index if not exists assets_drive_file_idx on public.assets(drive_file_id) where drive_file_id is not null;

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  episode_id uuid references public.episodes(id) on delete set null,
  title text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  priority integer not null default 0,
  progress integer not null default 0 check (progress between 0 and 100),
  manifest jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 4,
  claimed_by text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists production_jobs_queue_idx on public.production_jobs(status, priority desc, created_at asc);
create index if not exists production_jobs_owner_idx on public.production_jobs(owner_id, created_at desc);
create unique index if not exists production_jobs_idempotency_idx on public.production_jobs(owner_id, idempotency_key) where idempotency_key is not null;

-- Private credential tables: only the server's service-role client may access these.
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_refresh_token text not null,
  root_folder_id text,
  account_label text,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, provider)
);

create table if not exists public.worker_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'notebook-worker',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists worker_tokens_owner_idx on public.worker_tokens(owner_id, expires_at desc);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_owner_idx on public.activity_log(owner_id, created_at desc);

-- Updated-at triggers
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['projects','episodes','characters','locations','scenes','shots','assets','production_jobs','integrations'] LOOP
    EXECUTE format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    EXECUTE format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- RLS: users can only access their own creative data.
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

DO $$ BEGIN
  CREATE POLICY "projects owner access" ON public.projects FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "episodes owner access" ON public.episodes FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "characters owner access" ON public.characters FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "locations owner access" ON public.locations FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "scenes owner access" ON public.scenes FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "shots owner access" ON public.shots FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "assets owner access" ON public.assets FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "jobs owner access" ON public.production_jobs FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "activity owner access" ON public.activity_log FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Integrations and worker_tokens intentionally have no authenticated policies.

-- A worker claims exactly one eligible job. FOR UPDATE SKIP LOCKED prevents two workers
-- from claiming the same queued job. The lease allows another session to resume after expiry.
CREATE OR REPLACE FUNCTION public.claim_next_production_job(p_owner_id uuid, p_worker_label text)
RETURNS SETOF public.production_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.production_jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.production_jobs
  WHERE owner_id = p_owner_id
    AND attempt_count < max_attempts
    AND (status = 'queued' OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < now()))
  ORDER BY priority DESC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.production_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_by = left(coalesce(p_worker_label, 'notebook-worker'), 80),
      lease_expires_at = now() + interval '10 minutes',
      heartbeat_at = now(),
      last_error = null
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_production_job(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_production_job(uuid, text) TO service_role;

-- Private small preview bucket only. Large source clips and rendered masters belong in Drive.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-previews', 'studio-previews', false, 52428800, ARRAY['image/*','audio/*','video/mp4','application/pdf'])
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  CREATE POLICY "preview files owner access" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'studio-previews' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'studio-previews' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
