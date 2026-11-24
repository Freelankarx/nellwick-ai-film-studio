# Architecture

## Boundaries

**Vercel / Next.js** handles application screens and short authenticated API operations. It must not receive video-generation workloads or large raw video payloads.

**Supabase** owns user identity, project records, reusable characters/locations, production manifests, job leases and asset metadata. Row-level security is enabled for user-owned creative records. Google refresh tokens and worker token hashes are private to the server role.

**Google Drive** is the primary media file store. The browser starts resumable upload sessions and transfers chunks directly to Drive. Notebook workers receive short-lived Drive access tokens from the server and upload through Drive's resumable upload protocol.

**Kaggle / Colab** run a user-started batch worker. The notebook claims jobs over HTTPS, generates a short clip, uploads it to Drive, checkpoints the Drive file ID and continues. It never runs a public HTTP server.

## Reusable design rules

- Project/episode/scene/shot manifests are versioned JSON, independent of any one model.
- Each model adapter advertises task, input requirements, supported resolutions, precision and hardware constraints.
- The model registry separates researched candidates from adapters that are truly implemented.
- Each shot is an independently retryable unit. Image-generation tasks are also independent jobs; reference images are stored as normal project assets in Google Drive and can be attached to character/location records by asset ID.
- The queue uses a lease, heartbeat and `FOR UPDATE SKIP LOCKED` claim RPC.
- Media metadata refers to Drive file IDs; the application should not treat a Drive web-view URL as a stable public CDN URL.
- Small thumbnails can go to Supabase Storage; original MP4s and rendered masters go to Drive.

## Storage quota discipline

Supabase Free is used for metadata and small preview assets only. Google Drive's free account storage quota is shared with other Google services, so show storage usage and avoid assuming unlimited storage. When Drive is full, uploads should fail visibly while the application retains job state and offers retry after space is freed.
