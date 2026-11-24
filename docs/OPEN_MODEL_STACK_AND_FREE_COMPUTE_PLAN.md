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
| Audio music | ACE-Step 1.5 | Research candidate, not integrated. Validate exact checkpoint/weight licence and low-VRAM latency; code licence is not the model-weight licence. |
| Sound effects | Procedural sound design and specifically licensed local assets | Do not assume every online sound library is commercially reusable. |
| Editing/rendering | FFmpeg | Existing local clip assembly; expand to multi-track audio, transitions, captions, reframing and Shorts exports. |

## Models deliberately not in the free baseline

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
