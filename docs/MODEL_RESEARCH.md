# Model research and decision record

Research snapshot: 22 November 2026. Always re-check model cards, code, licences and hardware compatibility before enabling a new model. An open-source repository does not automatically mean its weights have the same licence.

## Decision: first notebook adapter

**Wan 2.1 T2V 1.3B (Diffusers): `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`**

- Task: text-to-video. Do not label this 1.3B checkpoint as image-to-video; Wan 2.1's official I2V checkpoints are 14B.
- Licence: Apache 2.0 on the Hugging Face model card and Wan 2.1 repository.
- The model authors state 8.19 GB VRAM for the native 1.3B 480p model path. Current Hugging Face Diffusers Wan pipeline documentation gives a roughly 13 GB reference for the T2V pipeline. These are different execution paths; plan conservatively around the Diffusers figure. Attention kernels, CUDA, PyTorch, precision, CPU offload, RAM and provider GPU availability all affect actual peak memory.
- Starting target: 832×480 landscape, 16 fps, 2–5 second clips. Vertical uses 480×832 as an experimental output size; validate visual stability before relying on it.
- The worker starts with FP16 + Diffusers model CPU offload, checks for at least 12 GiB total GPU memory (16 GiB preferred), uses a single shot as a resumable unit, and uploads every completed clip before moving on.
- The model card's public demonstration says a 5-second 480p clip takes about four minutes on an RTX 4090; do not extrapolate that time to a P100 or T4. Notebook GPUs are slower and have temporary quotas.

Sources:
- https://github.com/Wan-Video/Wan2.1
- https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B
- https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers

## Secondary benchmark candidates

### CogVideoX 2B (text-to-video)

The Hugging Face/Diffusers documentation reports approximately 12.5 GB for FP16 inference and 7.8 GB for INT8 with torchao. This makes it a useful comparison candidate, but INT8 support depends on the exact PyTorch, torchao, GPU architecture and CUDA environment. Do not automatically install a new Torch build over the notebook's working CUDA build.

- Model: https://huggingface.co/zai-org/CogVideoX-2b
- Memory documentation: https://huggingface.co/docs/diffusers/training/cogvideox
- Model card: Apache 2.0.

### CogVideoX 5B I2V

The I2V model card publishes a 5B image-to-video variant and reports low-memory Diffusers/INT8 options in its comparison. Another documented table reports roughly 11.4 GB for INT8 5B inference. Treat this as a benchmark, not a promise: P100/T4 compatibility with torchao kernels is not established by those headline numbers. The model's card lists 6-second 8-fps 720×480 output.

- Model: https://huggingface.co/zai-org/CogVideoX-5b-I2V
- Memory guide: https://huggingface.co/docs/diffusers/training/cogvideox
- Verify the model card's current licence and full usage terms before commercial publication.

## Not the free baseline

### Wan 2.2 TI2V 5B

The official documented 720p single-GPU command says at least 24 GB VRAM. This exceeds a standard free Kaggle P100 and many free Colab GPUs. It can remain in the model catalogue for future hardware, not be selected automatically on free sessions.

- https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B

### LTX-2.5

The official LTX repository calls LTX-2.5 the recommended model for new projects, but its model weights are 22B and licensed under the LTX-2.x Community License. The repository code is Apache 2.0, but that does not make the model weights Apache 2.0. LTX Desktop's published local recommendations are substantially above free P100/T4-class hardware. Revisit only when we have a suitable GPU or a specifically compatible quantized pathway.

- https://github.com/Lightricks/LTX-2
- https://github.com/Lightricks/LTX-Desktop

## Script and shot planning: Qwen3-4B with Qwen3-1.7B fallback (adapter implemented; runtime benchmark pending)

The Director and Storyboard now enqueue planning tasks for the interactive notebook worker. The worker selects `Qwen/Qwen3-4B` when the detected GPU has at least 15 GiB total VRAM; it selects `Qwen/Qwen3-1.7B` for GPUs with at least 8 GiB and less than 15 GiB. Both are Apache 2.0 model cards with a native 32,768-token context. The adapter uses FP16 Transformers inference with `device_map=auto`, a reserved GPU-memory budget and CPU offload; it does not require bitsandbytes. Qwen is unloaded after each planning task before a subsequent Wan video job is loaded.

- 4B model: https://huggingface.co/Qwen/Qwen3-4B
- 1.7B fallback: https://huggingface.co/Qwen/Qwen3-1.7B
- Qwen benchmark and model information: https://github.com/QwenLM/Qwen3

These are hardware-selection thresholds, not guarantees. The actual notebook must pass CUDA preflight, model download, generation and API completion on the assigned GPU. System RAM and free VRAM, other processes, Transformers/Accelerate versions, provider quotas and session duration affect success. The 1.7B fallback may produce shorter or less detailed outputs than 4B. The current story planner produces a first-draft treatment capped at 18 scenes per job; it must not be described as a complete feature-length screenplay. Users can expand scenes iteratively. Shot planning produces 3–6 draft shots per scene in normal operation, each constrained to the first Wan adapter's 2–5 second text-to-video format. No image generation, image-to-video or audio generation is implied by these planner jobs.

## Supporting models

### Images: Stable Diffusion XL Base 1.0

- Model: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- Licence: CreativeML Open RAIL++-M. This is not Apache 2.0; keep and comply with its use restrictions. It is a practical image-model candidate, not yet wired into the first worker's generation code.

### Speech: Kokoro 82M

- Model: https://huggingface.co/hexgrad/Kokoro-82M
- Licence: Apache 2.0 on the published model card.
- Lightweight TTS candidate for narration. We still need a voice-quality and pronunciation test before making it the default for characters.

## Notebook compute facts and limitations

- Kaggle publishes free NVIDIA P100 notebook GPU availability, but availability can be queued and account usage limits apply. Kaggle documentation pages have shown differing session/quota figures over time; use the live account's Notebook settings/quota indicator rather than relying on a static weekly number.
- Colab's official FAQ says free GPU access is not guaranteed or unlimited, limits fluctuate, and maximum VM lifetime/GPU type/idle timeout vary. It explicitly prohibits file hosting, media serving and other unrelated web services on managed runtimes, and prohibits deepfakes. This project's Colab notebook is therefore an interactive compute client only; it does not open a public port, expose a tunneled server, host a media endpoint or run a continuous service. Use only fictional/synthetic characters or properly authorized material; do not impersonate real people.
- Both services can disconnect or reclaim compute. A full episode is not one model call. It is many short shots, and every shot must be saved and checkpointed to Drive.

Sources:
- https://www.kaggle.com/docs/notebooks
- https://www.kaggle.com/page/GPU-tips-and-tricks
- https://research.google.com/colaboratory/faq.html

## Current implementation boundary

The Python worker now supports Qwen3 story/shot planning and Wan 2.1 T2V 1.3B text-to-video. The Qwen adapters still require live Kaggle/Colab GPU validation. CogVideoX, SDXL, Kokoro, and LTX entries are researched/catalogued candidates, not implemented adapters. The UI has reserved modules for script planning, storyboards, character continuity, editing, Shorts and audio, but the first delivered codebase does not claim those modules are finished. Implement and benchmark each adapter separately.
