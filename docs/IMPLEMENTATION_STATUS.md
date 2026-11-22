# Implementation status

## Included in this first code drop

- [x] New standalone Next.js application shell and cinematic responsive dashboard.
- [x] Supabase server/browser clients, session-refresh middleware and email/password login/signup page.
- [x] SQL schema for projects, episodes, characters, locations, scenes, shots, assets, production jobs, integrations, worker tokens and activity log.
- [x] RLS policies for user-owned creative data.
- [x] Project creation/listing and episode creation.
- [x] Manifest-driven multi-shot queue jobs (up to 120 prompts per job), linked optionally to a project episode; workers assemble shots in manifest order.
- [x] Production job creation, worker token issuance, atomic job claim, progress/checkpoint, completion and retry-on-failure lease flow.
- [x] Google Drive OAuth server flow with offline access and encrypted refresh token.
- [x] Chunked browser-to-Drive upload using Drive resumable sessions, followed by media metadata registration. Session recovery after a browser reload is not yet persisted.
- [x] Colab/Kaggle notebooks and a Wan 2.1 T2V 1.3B worker that uploads clips and masters to Drive.
- [x] Research/model decision record.

## Not yet implemented; do not treat as complete

- [ ] AI script/screenplay writer and scene/shot plan UI (Qwen3-4B researched as a local candidate; no adapter is wired yet).
- [ ] Character and world CRUD UI, character image generation and identity-conditioning.
- [ ] Storyboard image-generation adapter and approval interface.
- [ ] CogVideoX I2V or any image-to-video adapter.
- [ ] SDXL image-generation adapter.
- [ ] Kokoro TTS adapter, dialogue timing, music and audio mixing.
- [ ] Full multi-track editor and timeline data model/API.
- [ ] Automatic Shorts detection/reframing and social export presets.
- [x] Media management: rename in Drive, preview/open, download, tags, favourites, assign/unassign project, safe trash/restore (trash does not delete the Drive original).
- [ ] Named collections/folders in the application UI, bulk selection/actions, episode-level attachment controls, and permanent deletion policy.
- [ ] Automated model hardware benchmarking across Kaggle P100 and Colab GPU variants. The included preflight reports the actual GPU and rejects devices below the current 12 GiB guardrail and warns below 15 GiB; 16 GiB is preferred. Actual GPU compatibility still requires an end-to-end notebook test.
- [ ] End-to-end tests against real Supabase and Google Drive accounts.

This status file is deliberately explicit: an attractive UI shell is not proof of a working model pipeline. The worker checkpoint is per completed shot: completed clips are reused from Drive when a new notebook session resumes, but a GPU interruption in the middle of generating a shot may require that shot to be generated again. Run the test shot and verify the Drive file before relying on the worker for longer productions.

## Validation performed for this source package

- [x] Python worker passed `python -m py_compile`.
- [x] Both notebook files parsed as valid Jupyter JSON.
- [x] `package.json`, `tsconfig.json` and `model_registry.json` parsed as valid JSON.
- [x] 49 TypeScript/TSX source files passed a TypeScript transpile syntax check with zero parse diagnostics.
- [x] ZIP archive integrity check passed.
- [ ] Full TypeScript semantic typecheck, ESLint and Next.js production build. Dependency installation could not complete because the package registry connection timed out in the build environment.
- [ ] Live Supabase sign-in/database/RLS tests, Google OAuth consent and real Drive resumable-upload tests.
- [ ] Actual GPU inference and quality/speed benchmark in a Kaggle or Colab session.
- [ ] Live GitHub push and Vercel deployment.

A syntax check is not a substitute for `npm run typecheck`, `npm run lint` or `npm run build`. Complete those checks after installing dependencies locally, then test the cloud integrations and GPU worker with your own accounts.
