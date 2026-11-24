# NELLWICK ORIGINALS — Free and open production stack

This is the private production stack used only for NELLWICK ORIGINALS. It is not a hosted creator service and it must not silently use paid APIs.

## Operating rule: no paid inference

- Use Hugging Face Hub to discover and download model weights. Do not route generation through Inference Providers, paid Endpoints, paid Spaces or paid Jobs.
- Kaggle or Colab is an interactive, quota-limited worker, not an always-on GPU server. Free GPU availability is not guaranteed.
- Cache weights in the notebook runtime where possible. Persist completed media and checkpoints to Google Drive.
- Keep FFmpeg post-production local. Keep Supabase for job and media metadata, not large video blobs.

## Model decisions

| Work | Choice | Status |
|---|---|---|
| Story and shot planning | Qwen3 4B / 1.7B | Existing local worker adapter; benchmark on the actual free runtime. |
| Dialogue and narration | Kokoro 82M | Stage 5 local worker adapter. Apache-2.0 model; English US/UK preset voices; no voice cloning. |
| Character/location stills | SDXL Base 1.0 | Existing adapter only; text-only multi-view output is not an approved character identity solution. |
| Video generation | Wan 2.1 T2V 1.3B | Existing basic text-to-video fallback, not a quality ceiling and not image-to-video. |
| Image-to-video candidate | CogVideoX 5B I2V | Candidate only. Official model card documents a low-VRAM quantised Diffusers path; benchmark runtime, temporal stability and visual quality before production. |
| Larger text+image video | Wan 2.2 TI2V 5B | Not in the T4 baseline; documented 720p configuration requires substantially more memory. |
| Audio music | ACE-Step 1.5 | Best current local music candidate. The official ACE-Step 1.5 SFT model card declares MIT weights; the official install docs support 8–16 GB VRAM with a 0.6B/1.7B language model and CPU offload. Not integrated yet. The current Kaggle Python 3.13 runtime is outside ACE-Step's declared Python 3.11–3.12 range, so use a separately tested Python 3.12 worker environment or defer integration. |
| Sound effects | Procedural sound design and specifically licensed local assets | Do not assume every online sound library is commercially reusable. |
| Editing/rendering | FFmpeg | Existing local clip assembly; expand to multi-track audio, transitions, captions, reframing and Shorts exports. |

## Models deliberately not in the free baseline

- AudioLDM 2 is excluded for monetized NELLWICK output because its Hugging Face model card declares CC-BY-NC-SA-4.0 (non-commercial). Use ACE-Step for music and original/procedural or clearly commercial-use assets for sound effects.
- LTX-2.5 is high-end, not a T4/P100 target; published minimum requirements start at 32 GB VRAM, with A100/H100 recommended. Model weights have a separate community licence from Apache-2.0 code.
- HunyuanVideo 1.5 lists a 14 GB minimum with model offloading, close to the capacity of one 16 GB T4 and leaving little headroom. It also has a model-specific community licence and distribution conditions.
- Two T4 cards are not one combined 29 GB GPU. Multi-GPU inference requires explicit parallel implementation.

## Character continuity policy

The existing SDXL text-only multi-view output is not approved as a canonical character reference.

1. Generate and approve one strong canonical portrait/full-body reference.
2. Store the approved asset ID in the character reference list.
3. Create additional views from that approved image using a tested image-conditioned workflow.
4. Reuse approved image references and character metadata in each subsequent shot.
5. Reject outputs with changed face, hair, wardrobe, anatomy, framing errors, watermarks or unwanted text.
6. Benchmark reference-conditioned generation on the actual free GPU before enabling it by default.

A visual prompt alone is not an identity lock.

## Production workflow target

1. Brand/story brief.
2. Screenplay, beat sheet, scene breakdown and dialogue.
3. Character and location bible; approve references.
4. Shot list with shot size, angle, lens feel, camera motion, composition, lighting, blocking and duration.
5. Generate a small proof-of-quality shot before batching an episode.
6. Generate image-conditioned or text-conditioned shots through a tested adapter.
7. Generate dialogue/narration as separate WAV line assets.
8. Add ambience, music and effects from licensed/local sources.
9. Render an editable timeline and master using FFmpeg.
10. Create 9:16 Shorts/trailers from selected scenes; review captions and framing.
11. Store masters and assets in Drive, register metadata in Supabase, retain per-shot checkpoints.

## Build order

- Stage 5: local dialogue/narration with Kokoro and dashboard queue integration.
- Stage 6: reference-conditioned character pipeline and quality review.
- Stage 7: CogVideoX 5B I2V experimental adapter; benchmark on the real Kaggle GPU before production.
- Stage 8: FFmpeg multi-track rendering (video, dialogue, music, ambience, effects, captions, transitions, 16:9 and 9:16 exports).
- Stage 9: local soundtrack generation using a commercially usable checkpoint with a tested low-VRAM configuration.
- Stage 10: automatic Shorts/trailer extraction and end-to-end episode benchmark.

## Free-compute operating policy

The four-hour daily schedule is an operator target, not a GPU guarantee. Kaggle/Colab availability, queue wait, model downloads and quotas vary. A long episode may span multiple worker sessions. Every task must save durable checkpoints and resume without regenerating finished shots.

Prioritise one polished eight-minute episode and its cutdowns over a large batch of low-quality silent clips. Increase stretch targets only after the end-to-end quality test proves the workflow.


## Stage 6 — Experimental LTX image-to-video integration (2026-11-24)

The storyboard now supports selecting an existing project-owned image asset as a shot's first-frame reference. The authenticated shot-queue API validates that every selected source image belongs to the signed-in user's selected project and has a Google Drive file ID. It includes the source asset and Drive ID in the worker manifest; no public image URL or cross-project asset reference is accepted.

The worker has an experimental LTX-Video 0.9.6 distilled Diffusers adapter. It downloads the selected image from the existing Google Drive integration, creates a short 2–5 second image-conditioned clip, validates the MP4 with FFmpeg, then follows the existing checkpoint/upload/asset registration path. Wan 2.1 remains the text-to-video fallback.

**Important:** This code integration is not proof that LTX runs on a Kaggle T4. The upstream documentation commonly recommends BF16, while T4 does not provide native BF16. This adapter deliberately attempts FP16 with CPU offload as an experiment; model loading, dtype compatibility, peak VRAM, speed, output quality and commercial model licence must be checked before routine monetized use. If it fails, retain Wan T2V and use the exact Kaggle traceback to select a T4-compatible model/quantization route. Do not mark LTX production-ready without an actual GPU render.


## Stage 7 — NELLWICK ORIGINALS brand bible, Edge speech and final rendering

- A one-click project action seeds the NELLWICK ORIGINALS cast (Daniel, Grace, Lily, Michael, Milo and Narrator), Bennett Living Room/Kitchen/Porch locations and two NELLWICK product identities. It only creates missing entries; existing edited profiles are left untouched. Product descriptions defer to real product photography/specifications and prohibit invented product claims.
- Project settings JSON stores brand/product guidance. This reuses existing Supabase project, character and location tables; no SQL migration is required.
- Audio generation supports local Kokoro preset voices or optional Edge TTS. Edge produces MP3 dialogue and word-boundary SRT assets where the upstream service returns boundaries. Edge is online/unofficial and may be throttled; it is not treated as unlimited or contractually guaranteed. Kokoro remains the offline option. Neither engine clones actor voices or performs lip-sync.
- The Film Editor stores a picture timeline, separate dialogue/narration/music/SFX tracks, start offsets, volume and optional SRT selection under the episode production manifest.
- The episode render endpoint validates every source asset against the signed-in project, refuses silent episode jobs, and enqueues an FFmpeg task. The worker normalises image/video segments sequentially, checkpoints rendered segments to Drive, concatenates the picture, mixes audio tracks, optionally burns SRT subtitles, validates the MP4 and registers the final master.
- The Shorts endpoint validates saved short plans and source project videos, then queues a 9:16 centre-crop render while retaining source-video audio. Duration is constrained to 1–180 seconds.
- These are first export tools, not a full nonlinear editor: the current renderer uses hard cuts, centre crop and a subtle Ken Burns move for stills. Face-aware reframing, advanced transitions, grading, music/SFX generation and lip-sync remain later tasks.


## Stage 8 — Experimental MuseTalk talking-character shots (2026-11-24)

- Adds an authenticated `/api/jobs/lipsync` endpoint. Portrait and audio inputs must be active assets owned by the signed-in user and belong to the same project. If a character is selected, the portrait must already be attached to that character's approved `reference_asset_ids`.
- Adds an Audio Studio panel for selecting a character, approved portrait and dialogue/narration audio file, then queueing a talking-character clip.
- Adds a worker adapter for MuseTalk 1.5. It converts the still portrait into a source video matching the audio duration, then uses the MuseTalk v15 pipeline to animate the mouth/face. Output is validated and stored in the project's Google Drive and Media Library.
- The adapter runs in a separate Python 3.10 / CUDA 11.8 virtual environment, rather than changing the existing NELLWICK Python 3.13 / PyTorch 2.11 runtime. The environment is installed on first use and cached in the Kaggle working directory for that session. The first run downloads several GB of model files; new Kaggle sessions may need the setup and model downloads again.
- The worker uses one GPU only, FP16 and a batch size of 4; the T4/P100 fit and actual output quality must be benchmarked. The source code's published hardware tests include a 4 GB RTX 3050 Ti configuration, but that is not proof of our Kaggle runtime.
- This is a talking close-up generator, not a full body-animation model. It does not guarantee character identity, and its upstream project documents possible facial detail changes and jitter. The worker limits individual talking shots to 0.8–60 seconds.
- **Commercial rights warning:** MuseTalk code and model files are presented as MIT in the official project materials, but the official NOTICE also says the weights were trained on HDTF/private data and asks users to communicate with the HDTF owner about commercialization. Review the complete NOTICE and component terms before using output in monetized NELLWICK publishing. This adapter is experimental, not a representation that all rights have been cleared.
- No SQL migration is needed; it uses the existing production_jobs, assets and character reference asset fields.

## Remaining gaps after Stage 8

- No verified T4 render has been completed for LTX or MuseTalk yet. Both adapters still require one live test per model.
- MuseTalk animates face/mouth only. Full body action, character-to-character interaction and sustained camera/actor motion still depend on image-to-video/video models and have not been solved by lip-sync.
- Music generation, sound-effect generation, face-aware 9:16 reframing, advanced transitions, colour grading and automatic episode-level orchestration are still future production stages.
- A successful code build and job queue are not the same as a verified, watchable episode. The acceptance test is a short scene with consistent character appearance, usable lip motion, clear voice, music/ambience and a finished edited MP4.
