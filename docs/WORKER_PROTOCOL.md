# Notebook worker protocol

## Why this is a notebook client, not a remote model server

The user starts a Kaggle or Colab notebook when work should run. The notebook authenticates with a short-lived/revocable worker token, claims one queued job, processes shots, uploads completed outputs to Google Drive, and reports progress to the Vercel API. It does not run Flask/FastAPI, expose a port, create a public tunnel, or serve files.

## Job lifecycle

1. A signed-in user submits a production manifest; `production_jobs` receives `queued` state.
2. Notebook calls `POST /api/worker/claim`.
3. The database RPC claims one job with a 10-minute lease. `FOR UPDATE SKIP LOCKED` prevents simultaneous claims of the same job.
4. Worker generates one shot at a time and uploads each completed MP4 to Drive using resumable upload.
5. Worker calls `POST /api/worker/progress` with the `completed_shots` checkpoint after each upload. Heartbeats renew the lease.
6. A restarted session reclaims an expired job and downloads already-completed shots from Drive instead of regenerating them.
7. Worker concatenates clips with FFmpeg, uploads the master file, registers all media metadata, and marks the job completed.
8. A failure returns the job to `queued` while attempts remain; after the configured maximum it becomes `failed`.

## Worker token

Create a token in Studio → Settings. The raw token is shown once; only its SHA-256 hash is stored in `worker_tokens`. It expires after 30 days. Revoke it by setting `revoked_at` for its row in Supabase or use the future token-management UI. Do not store tokens in GitHub, notebook source cells, or screenshots.

## Google Drive

The Vercel server stores an AES-256-GCM-encrypted Google OAuth refresh token. The notebook receives a short-lived access token from `/api/worker/drive-token` when it needs Drive access. The first worker creates a folder layout beneath `NELLWICK AI FILM STUDIO/Projects/...`.

Large uploads use the Drive resumable upload protocol. This is important because a clip upload can be interrupted; Drive's resumable upload sessions can continue from the byte range already accepted. A Drive upload session expires after one week, so never treat a session URI as a permanent asset URL.

## Current worker capability

The included worker supports Wan 2.1 T2V 1.3B text-to-video shots of 2–5 seconds. It can process a multi-shot manifest and concatenate the resulting clips. It does not yet provide full screenplay generation, text-to-image, image-to-video, voice cloning, multi-track timeline editing, music licensing, automatic Shorts selection or YouTube publishing.
