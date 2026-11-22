# NELLWICK AI Film Studio — implementation status

This document separates implemented workspace workflows from model/rendering capabilities that still require integration and live testing.

## Included in this feature batch

- [x] Middleware redirects signed-out visitors from studio pages to `/login` and preserves the requested destination.
- [x] Login page returns signed-in users to a safe same-origin destination; studio shell includes sign-out.
- [x] Project detail supports editing and deleting the project, episode creation and direct links into the selected episode's Director and Storyboard tools.
- [x] Episode API supports updating synopsis, screenplay, status and JSON production manifest, plus deletion.
- [x] Character create/list/update/delete records scoped to the user's project.
- [x] Location create/list/update/delete records scoped to the user's project.
- [x] Scene create/list/update/delete records scoped to the user's episode.
- [x] Shot create/list/update/delete records scoped to the user's scene.
- [x] Director saves screenplay and synopsis; deterministic screenplay heading parser creates scene records. No LLM screenplay generation adapter is connected.
- [x] Storyboard edits shot prompts, action descriptions, negative prompts and duration; compatible saved shots can be queued from the storyboard.
- [x] A storyboard-shot queue endpoint creates production manifests with the persisted shot UUIDs and validates compatibility with the existing Wan 2.1 T2V 1.3B worker.
- [x] Worker claim, completion, failure and retry handlers synchronize linked shot states. Generated shot files are linked back to their storyboard records.
- [x] Media Library can filter by project.
- [x] Audio page lists and uploads audio assets through the existing Drive uploader. TTS, voice cloning and mixing are not implemented.
- [x] Film Editor stores a non-destructive edit decision list in an episode production manifest. Final multi-track rendering, transitions, audio mixing and export are not implemented.
- [x] Shorts Studio stores vertical source-range plans in an episode production manifest. Automatic reframing, captions and actual short rendering are not implemented.
- [x] Kaggle and Colab notebooks reference the actual Freelankarx repository URL. They attempt public clone first and request a read-only GitHub token only if private-repository authentication is needed; the token is not written to the remote URL or notebook file.

## Existing capabilities carried forward

- [x] Supabase schema and RLS policies for projects, episodes, characters, locations, scenes, shots, assets, production jobs, integrations, worker tokens and activity log.
- [x] Email/password Supabase authentication.
- [x] Project and episode base APIs, production job queue, worker token, atomic worker claim, progress and Google Drive OAuth/upload APIs.
- [x] Media metadata management, favourites, tags, project assignment and soft trash/restore.
- [x] Wan 2.1 T2V 1.3B worker adapter with resumable per-shot checkpointing and Drive output registration.

## Still not complete

- [ ] AI screenplay generation and AI-assisted story development via a connected provider/model.
- [ ] Character/reference image generation, identity conditioning and image-to-video adapter.
- [ ] Storyboard image generation and visual approval/revision tools.
- [ ] Speech synthesis, dialogue timing, voice cloning, licensed music and audio mixing.
- [ ] Full multi-track timeline with preview, transitions, captions/subtitles, audio mixing and FFmpeg master export.
- [ ] Actual vertical reframing/cropping, caption generation and Shorts export.
- [ ] Additional model adapters beyond the current Wan 2.1 T2V 1.3B text-to-video path.
- [ ] Live end-to-end tests against the user's Vercel deployment, Supabase Auth, Google Drive OAuth/resumable uploads and real Kaggle/Colab GPU inference.

## Validation status

- [x] All patch TypeScript/TSX files passed TypeScript transpile syntax validation (no parse diagnostics).
- [x] A local structural type pass with temporary ambient stubs found no additional internal TypeScript errors. This is not a substitute for the project's actual `npm run typecheck`.
- [x] Both Jupyter notebooks parse as valid JSON after the repository URL update.
- [ ] Full project `npm run typecheck`, `npm run lint` and `npm run build` must be run in the user's project folder where the real dependencies are installed.
- [ ] Auth/session tests, CRUD tests, production queue tests, worker processing, Drive registration and rendered-output tests remain to be run against the live services.

A page displaying a working control is not considered complete until its operation has been verified against the live service. Do not treat edit plans as rendered videos or asset management as generated audio.
