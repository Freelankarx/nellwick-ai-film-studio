"""Local Kokoro dialogue and narration generation for NELLWICK."""
from __future__ import annotations

import gc
import math
import re
import tempfile
from pathlib import Path
from typing import Any

SAMPLE_RATE = 24_000
MODEL_ID = "hexgrad/Kokoro-82M"
MAX_SEGMENTS = 30
MAX_TEXT_LENGTH = 3_000

VOICE_LANGUAGES = {
    "af_heart": "a", "af_bella": "a", "af_sarah": "a", "af_nicole": "a",
    "am_michael": "a", "am_fenrir": "a", "am_puck": "a",
    "bf_emma": "b", "bf_isabella": "b", "bm_george": "b", "bm_lewis": "b",
}


def normalise_segments(raw: Any) -> list[dict[str, Any]]:
    """Validate a queued dialogue manifest before loading model weights."""
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_SEGMENTS:
        raise ValueError(f"Audio job must contain between 1 and {MAX_SEGMENTS} dialogue lines.")
    segments = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Dialogue line {index} is not a valid object.")
        text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()
        if not 1 <= len(text) <= MAX_TEXT_LENGTH:
            raise ValueError(f"Dialogue line {index} must contain 1 to {MAX_TEXT_LENGTH} characters.")
        voice_id = str(item.get("voice_id") or item.get("voiceId") or "af_heart").strip()
        language = VOICE_LANGUAGES.get(voice_id)
        if not language:
            raise ValueError(f"Unsupported Kokoro voice preset on dialogue line {index}: {voice_id}")
        try:
            speed = float(item.get("speed", 1.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Dialogue line {index} has an invalid speaking speed.") from exc
        if not math.isfinite(speed) or not 0.75 <= speed <= 1.25:
            raise ValueError(f"Dialogue line {index} speed must be between 0.75 and 1.25.")
        speaker = re.sub(r"[^A-Za-z0-9 _-]+", "", str(item.get("speaker") or "Narrator")).strip()
        segments.append({
            "id": str(item.get("id") or f"line-{index:03d}")[:80],
            "speaker": (speaker or "Narrator")[:80],
            "text": text,
            "voice_id": voice_id,
            "language": language,
            "speed": speed,
        })
    return segments


def _to_audio_array(value: Any, np: Any) -> Any:
    if value is None:
        raise RuntimeError("Kokoro returned an empty audio segment.")
    if hasattr(value, "detach"):
        value = value.detach().float().cpu().numpy()
    array = np.asarray(value, dtype=np.float32).squeeze()
    if array.ndim != 1 or array.size == 0 or not np.isfinite(array).all():
        raise RuntimeError("Kokoro returned invalid audio samples.")
    if float(np.max(np.abs(array))) < 1e-5:
        raise RuntimeError("Kokoro returned silence; the line was not saved.")
    return array


def process_kokoro_audio_job(worker: Any, job: dict[str, Any]) -> None:
    """Generate line WAVs and a combined dialogue track, then register them in the Studio."""
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    job_id = job["id"]
    manifest = job.get("manifest") or {}
    project = manifest.get("project") or {}
    episode = manifest.get("episode") or {}
    project_name = str(project.get("name") or "NELLWICK Project")
    episode_title = str(episode.get("title") or "Voice Session")
    segments = normalise_segments(manifest.get("segments"))

    worker.unload_wan()
    worker.unload_qwen()
    worker.unload_sdxl()
    work_dir = Path(tempfile.mkdtemp(prefix="nellwick_kokoro_"))
    pipelines: dict[str, Any] = {}
    combined_parts = []
    assets = []

    try:
        worker.update_progress(job_id, 3, "Preparing local Kokoro voice model")
        if not worker.root_folder_id:
            worker.get_drive_credentials()
        projects_folder = worker.ensure_folder("Projects", worker.root_folder_id)
        project_folder = worker.ensure_folder(project_name[:100], projects_folder)
        if episode.get("id"):
            episodes_folder = worker.ensure_folder("Episodes", project_folder)
            destination_folder = worker.ensure_folder(episode_title[:100], episodes_folder)
        else:
            destination_folder = project_folder
        audio_folder = worker.ensure_folder("Dialogue & Narration", destination_folder)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        silence = np.zeros(int(SAMPLE_RATE * 0.38), dtype=np.float32)

        for index, segment in enumerate(segments, start=1):
            worker.raise_if_cancelled()
            language = segment["language"]
            if language not in pipelines:
                worker.update_progress(job_id, 5 + ((index - 1) / len(segments)) * 65,
                    "Loading Kokoro " + ("American English" if language == "a" else "British English"))
                pipelines[language] = KPipeline(lang_code=language, repo_id=MODEL_ID, device=device)

            worker.update_progress(job_id, 8 + ((index - 1) / len(segments)) * 72,
                f"Generating line {index}/{len(segments)} · {segment['speaker']}")
            chunks = []
            for result in pipelines[language](
                segment["text"], voice=segment["voice_id"], speed=segment["speed"], split_pattern=None
            ):
                worker.raise_if_cancelled()
                chunks.append(_to_audio_array(result.audio, np))
            if not chunks:
                raise RuntimeError(f"Kokoro produced no speech for line {index}.")
            samples = np.concatenate(chunks)
            if samples.size < int(SAMPLE_RATE * 0.12):
                raise RuntimeError(f"Kokoro output for line {index} is unexpectedly short.")

            safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", segment["speaker"]).strip("_")[:32] or "speaker"
            output_path = work_dir / f"{index:02d}_{safe_speaker}_{segment['id'][:18]}.wav"
            sf.write(str(output_path), samples, SAMPLE_RATE, subtype="PCM_16")
            info = sf.info(str(output_path))
            if info.frames <= 0 or info.samplerate != SAMPLE_RATE:
                raise RuntimeError(f"Generated WAV verification failed for line {index}.")
            combined_parts.extend([samples, silence])

            worker.update_progress(job_id, 10 + (index / len(segments)) * 72,
                f"Uploading line {index}/{len(segments)}")
            drive_file = worker.upload_resumable(output_path, audio_folder, "audio/wav")
            assets.append({
                "name": drive_file.get("name") or output_path.name,
                "mime_type": "audio/wav",
                "file_size": int(drive_file.get("size", output_path.stat().st_size)),
                "drive_file_id": drive_file["id"],
                "drive_path": f"Projects/{project_name}/" + (
                    f"Episodes/{episode_title}/" if episode.get("id") else ""
                ) + "Dialogue & Narration",
                "source_type": "generated",
                "metadata": {
                    "purpose": "dialogue_line", "task": "audio_generation", "model_id": MODEL_ID,
                    "segment_id": segment["id"], "speaker": segment["speaker"],
                    "voice_id": segment["voice_id"], "language": language,
                    "speed": segment["speed"], "text": segment["text"],
                    "sample_rate": SAMPLE_RATE, "duration_seconds": round(info.duration, 3),
                },
            })

        worker.raise_if_cancelled()
        worker.update_progress(job_id, 88, "Building combined dialogue track")
        combined = np.concatenate(combined_parts[:-1])
        master_path = work_dir / "nellwick_dialogue_track.wav"
        sf.write(str(master_path), combined, SAMPLE_RATE, subtype="PCM_16")
        master_info = sf.info(str(master_path))
        if master_info.frames <= 0:
            raise RuntimeError("Combined dialogue track is empty.")

        worker.update_progress(job_id, 93, "Uploading combined dialogue track")
        master_drive = worker.upload_resumable(master_path, audio_folder, "audio/wav")
        assets.append({
            "name": master_drive.get("name") or master_path.name,
            "mime_type": "audio/wav",
            "file_size": int(master_drive.get("size", master_path.stat().st_size)),
            "drive_file_id": master_drive["id"],
            "drive_path": f"Projects/{project_name}/" + (
                f"Episodes/{episode_title}/" if episode.get("id") else ""
            ) + "Dialogue & Narration",
            "source_type": "rendered",
            "metadata": {
                "purpose": "combined_dialogue_track", "task": "audio_generation", "model_id": MODEL_ID,
                "segment_count": len(segments), "sample_rate": SAMPLE_RATE,
                "duration_seconds": round(master_info.duration, 3), "pause_between_lines_seconds": 0.38,
            },
        })
        worker.raise_if_cancelled()
        worker.update_progress(job_id, 97, "Registering generated voices in the Media Library")
        worker.api("POST", "/api/worker/complete", json={
            "job_id": job_id, "assets": assets,
            "result": {
                "task": "audio_generation", "model_id": MODEL_ID, "segment_count": len(segments),
                "combined_track_drive_file_id": master_drive["id"], "sample_rate": SAMPLE_RATE,
                "duration_seconds": round(master_info.duration, 3),
            },
        })
        print(f"Kokoro job completed: {len(segments)} dialogue lines and one combined track.")
    finally:
        pipelines.clear()
        combined_parts.clear()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
