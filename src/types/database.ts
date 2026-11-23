/**
 * NELLWICK AI FILM STUDIO database types.
 * Mirrors database/migrations/0001_initial_schema.sql and additive migrations.
 * Keep this file in sync with every SQL migration.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type ProjectType =
  | "film"
  | "series"
  | "advertisement"
  | "documentary"
  | "social"
  | "other";
export type EpisodeStatus =
  | "draft"
  | "planning"
  | "approved"
  | "queued"
  | "processing"
  | "completed"
  | "archived";
export type AssetSource = "uploaded" | "generated" | "rendered" | "imported";
export type StorageProvider = "google_drive" | "supabase" | "local" | "external";
export type ProductionJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

 type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  project_type: ProjectType;
  aspect_ratio: AspectRatio;
  settings: Json;
  created_at: string;
  updated_at: string;
};
type EpisodeRow = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  synopsis: string;
  script_markdown: string;
  target_duration_seconds: number | null;
  aspect_ratio: AspectRatio;
  status: EpisodeStatus;
  production_manifest: Json;
  created_at: string;
  updated_at: string;
};
type CharacterRow = {
  id: string;
  owner_id: string;
  project_id: string;
  name: string;
  role: string;
  canonical_description: string;
  visual_traits: Json;
  wardrobe: Json;
  voice_profile: Json;
  reference_asset_ids: string[];
  continuity_notes: string;
  created_at: string;
  updated_at: string;
};
type LocationRow = {
  id: string;
  owner_id: string;
  project_id: string;
  name: string;
  description: string;
  visual_reference_ids: string[];
  continuity_notes: string;
  created_at: string;
  updated_at: string;
};
type SceneRow = {
  id: string;
  owner_id: string;
  episode_id: string;
  scene_number: number;
  title: string;
  summary: string;
  location_id: string | null;
  script_excerpt: string;
  continuity_notes: string;
  generated_by_job_id: string | null;
  created_at: string;
  updated_at: string;
};
type ShotRow = {
  id: string;
  owner_id: string;
  scene_id: string;
  shot_number: number;
  prompt: string;
  negative_prompt: string;
  camera: Json;
  action_description: string;
  duration_seconds: number;
  aspect_ratio: string;
  generation_mode: string;
  model_id: string;
  generation_settings: Json;
  status: string;
  output_asset_id: string | null;
  generated_by_job_id: string | null;
  created_at: string;
  updated_at: string;
};
type AssetRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  episode_id: string | null;
  name: string;
  mime_type: string | null;
  file_size: number | null;
  source_type: AssetSource;
  storage_provider: StorageProvider;
  drive_file_id: string | null;
  drive_path: string | null;
  supabase_bucket: string | null;
  supabase_path: string | null;
  thumbnail_asset_id: string | null;
  tags: string[];
  is_favorite: boolean;
  metadata: Json;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type ProductionJobRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  episode_id: string | null;
  title: string;
  status: ProductionJobStatus;
  priority: number;
  progress: number;
  manifest: Json;
  result: Json;
  attempt_count: number;
  max_attempts: number;
  claimed_by: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
type IntegrationRow = {
  id: string;
  owner_id: string;
  provider: string;
  encrypted_refresh_token: string;
  root_folder_id: string | null;
  account_label: string | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
};
type WorkerTokenRow = {
  id: string;
  owner_id: string;
  token_hash: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};
type ActivityLogRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  details: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: Table<ProjectRow, {
        id?: string; owner_id: string; name: string; description?: string;
        project_type?: ProjectType; aspect_ratio?: AspectRatio; settings?: Json;
        created_at?: string; updated_at?: string;
      }>;
      episodes: Table<EpisodeRow, {
        id?: string; owner_id: string; project_id: string; title: string;
        synopsis?: string; script_markdown?: string; target_duration_seconds?: number | null;
        aspect_ratio?: AspectRatio; status?: EpisodeStatus; production_manifest?: Json;
        created_at?: string; updated_at?: string;
      }>;
      characters: Table<CharacterRow, {
        id?: string; owner_id: string; project_id: string; name: string;
        role?: string; canonical_description?: string; visual_traits?: Json;
        wardrobe?: Json; voice_profile?: Json; reference_asset_ids?: string[];
        continuity_notes?: string; created_at?: string; updated_at?: string;
      }>;
      locations: Table<LocationRow, {
        id?: string; owner_id: string; project_id: string; name: string;
        description?: string; visual_reference_ids?: string[]; continuity_notes?: string;
        created_at?: string; updated_at?: string;
      }>;
      scenes: Table<SceneRow, {
        id?: string; owner_id: string; episode_id: string; scene_number: number;
        title?: string; summary?: string; location_id?: string | null;
        script_excerpt?: string; continuity_notes?: string; generated_by_job_id?: string | null; created_at?: string; updated_at?: string;
      }>;
      shots: Table<ShotRow, {
        id?: string; owner_id: string; scene_id: string; shot_number: number;
        prompt?: string; negative_prompt?: string; camera?: Json; action_description?: string;
        duration_seconds?: number; aspect_ratio?: string; generation_mode?: string;
        model_id?: string; generation_settings?: Json; status?: string;
        output_asset_id?: string | null; generated_by_job_id?: string | null; created_at?: string; updated_at?: string;
      }>;
      assets: Table<AssetRow, {
        id?: string; owner_id: string; project_id?: string | null; episode_id?: string | null;
        name: string; mime_type?: string | null; file_size?: number | null;
        source_type?: AssetSource; storage_provider?: StorageProvider;
        drive_file_id?: string | null; drive_path?: string | null;
        supabase_bucket?: string | null; supabase_path?: string | null;
        thumbnail_asset_id?: string | null; tags?: string[]; is_favorite?: boolean;
        metadata?: Json; deleted_at?: string | null; created_at?: string; updated_at?: string;
      }>;
      production_jobs: Table<ProductionJobRow, {
        id?: string; owner_id: string; project_id?: string | null; episode_id?: string | null;
        title: string; status?: ProductionJobStatus; priority?: number; progress?: number;
        manifest?: Json; result?: Json; attempt_count?: number; max_attempts?: number;
        claimed_by?: string | null; lease_expires_at?: string | null; heartbeat_at?: string | null;
        last_error?: string | null; idempotency_key?: string | null;
        created_at?: string; updated_at?: string; completed_at?: string | null;
      }>;
      integrations: Table<IntegrationRow, {
        id?: string; owner_id: string; provider: string; encrypted_refresh_token: string;
        root_folder_id?: string | null; account_label?: string | null;
        connected_at?: string; created_at?: string; updated_at?: string;
      }>;
      worker_tokens: Table<WorkerTokenRow, {
        id?: string; owner_id: string; token_hash: string; label?: string;
        expires_at: string; revoked_at?: string | null; last_used_at?: string | null;
        created_at?: string;
      }>;
      activity_log: Table<ActivityLogRow, {
        id?: string; owner_id: string; project_id?: string | null; entity_type: string;
        entity_id?: string | null; action: string; details?: Json; created_at?: string;
      }>;
    };
    Views: Record<never, never>;
    Functions: {
      claim_next_production_job: {
        Args: { p_owner_id: string; p_worker_label: string };
        Returns: ProductionJobRow[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
