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


EDGE_VOICES = {
    "en-US-ChristopherNeural",
    "en-US-JennyNeural",
    "en-US-AnaNeural",
    "en-US-GuyNeural",
    "en-US-SteffanNeural",
}


def _srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{millis:03d}"


def _shift_srt(source: str, offset_seconds: float, first_index: int) -> tuple[str, int]:
    import re
    blocks = re.split(r"\r?\n\s*\r?\n", source.strip())
    shifted = []
    sequence = first_index
    for block in blocks:
        lines = block.strip().splitlines()
        time_index = next((i for i, line in enumerate(lines) if "-->" in line), -1)
        if time_index < 0:
            continue
        start_text, end_text = [part.strip().split()[0] for part in lines[time_index].split("-->", 1)]
        def parse(value: str) -> float:
            hms, millis = value.replace(",", ".").split(".")
            hours, minutes, seconds = [int(part) for part in hms.split(":")]
            return hours * 3600 + minutes * 60 + seconds + int((millis + "000")[:3]) / 1000
        shifted_start = _srt_timestamp(parse(start_text) + offset_seconds)
        shifted_end = _srt_timestamp(parse(end_text) + offset_seconds)
        text_lines = lines[time_index + 1:]
        if not text_lines:
            continue
        sequence += 1
        shifted.append(f"{sequence}\n{shifted_start} --> {shifted_end}\n" + "\n".join(text_lines))
    return ("\n\n".join(shifted) + ("\n" if shifted else ""), sequence)


def process_edge_tts_audio_job(worker: Any, job: dict[str, Any]) -> None:
    """Generate online Edge TTS lines with word-boundary SRTs. This is optional and may be throttled."""
    import asyncio
    import edge_tts
    from mutagen.mp3 import MP3

    job_id = job["id"]
    manifest = job.get("manifest") or {}
    project = manifest.get("project") or {}
    episode = manifest.get("episode") or {}
    project_name = str(project.get("name") or "NELLWICK Project")
    episode_title = str(episode.get("title") or "Voice Session")
    segments = manifest.get("segments")
    if not isinstance(segments, list) or not 1 <= len(segments) <= MAX_SEGMENTS:
        raise ValueError(f"Edge TTS job must contain between 1 and {MAX_SEGMENTS} dialogue lines.")

    normalized = []
    for index, item in enumerate(segments, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Dialogue line {index} is invalid.")
        text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()
        voice = str(item.get("voice_id") or item.get("voiceId") or "").strip()
        if not text or len(text) > MAX_TEXT_LENGTH:
            raise ValueError(f"Dialogue line {index} must contain 1 to {MAX_TEXT_LENGTH} characters.")
        if voice not in EDGE_VOICES:
            raise ValueError(f"Unsupported Edge TTS voice on line {index}: {voice}")
        try:
            speed = float(item.get("speed", 1.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Dialogue line {index} has an invalid speaking speed.") from exc
        if not math.isfinite(speed) or not 0.75 <= speed <= 1.25:
            raise ValueError(f"Dialogue line {index} speed must be between 0.75 and 1.25.")
        speaker = re.sub(r"[^A-Za-z0-9 _-]+", "", str(item.get("speaker") or "Narrator")).strip() or "Narrator"
        normalized.append({
            "id": str(item.get("id") or f"line-{index:03d}")[:80],
            "speaker": speaker[:80],
            "text": text,
            "voice_id": voice,
            "speed": speed,
        })

    worker.unload_ltx()
    worker.unload_wan()
    worker.unload_qwen()
    worker.unload_sdxl()
    work_dir = Path(tempfile.mkdtemp(prefix="nellwick_edge_tts_"))
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

    async def create_line(segment: dict[str, Any], index: int) -> tuple[Path, str]:
        safe_speaker = re.sub(r"[^A-Za-z0-9_-]+", "_", segment["speaker"]).strip("_")[:32] or "speaker"
        audio_path = work_dir / f"{index:02d}_{safe_speaker}.mp3"
        subtitles = edge_tts.SubMaker()
        rate_percent = int(round((segment["speed"] - 1.0) * 100))
        rate = f"{rate_percent:+d}%"
        communicate = edge_tts.Communicate(
            text=segment["text"],
            voice=segment["voice_id"],
            rate=rate,
        )
        with audio_path.open("wb") as stream:
            async for chunk in communicate.stream():
                worker.raise_if_cancelled()
                if chunk.get("type") == "audio":
                    stream.write(chunk["data"])
                elif chunk.get("type") == "WordBoundary":
                    subtitles.feed(chunk)
        if not audio_path.exists() or audio_path.stat().st_size < 1_000:
            raise RuntimeError(f"Edge TTS returned no usable speech for line {index}.")
        duration = float(MP3(str(audio_path)).info.length)
        if duration <= 0.1:
            raise RuntimeError(f"Edge TTS returned an invalid duration for line {index}.")
        srt = subtitles.get_srt() if hasattr(subtitles, "get_srt") else ""
        return audio_path, srt or ""

    async def generate_all() -> list[tuple[Path, str, dict[str, Any]]]:
        generated = []
        for index, segment in enumerate(normalized, start=1):
            worker.raise_if_cancelled()
            worker.update_progress(job_id, 5 + ((index - 1) / len(normalized)) * 66,
                f"Generating Edge voice line {index}/{len(normalized)} · {segment['speaker']}")
            audio_path, srt = await create_line(segment, index)
            generated.append((audio_path, srt, segment))
        return generated

    try:
        generated = asyncio.run(generate_all())
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        silence_path = work_dir / "dialogue_pause.mp3"
        silence_run = subprocess.run([
            ffmpeg, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", "0.38", "-c:a", "libmp3lame", "-q:a", "9", str(silence_path),
        ], capture_output=True, text=True, timeout=120)
        if silence_run.returncode != 0 or not silence_path.exists():
            raise RuntimeError("Could not create the short pause between dialogue lines: " + (silence_run.stderr or "")[-800:])
        concat_file = work_dir / "audio_concat.txt"
        concat_entries = []
        for index, (path, _, _) in enumerate(generated):
            concat_entries.append("file '" + str(path.resolve()).replace("'", r"'\\''") + "'")
            if index < len(generated) - 1:
                concat_entries.append("file '" + str(silence_path.resolve()).replace("'", r"'\\''") + "'")
        concat_file.write_text("\n".join(concat_entries) + "\n", encoding="utf-8")
        combined_path = work_dir / "nellwick_edge_dialogue.mp3"
        worker.update_progress(job_id, 76, "Assembling combined dialogue and word-timed subtitles")
        run = subprocess.run([
            ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:a", "libmp3lame", "-q:a", "3", str(combined_path),
        ], capture_output=True, text=True, timeout=900)
        if run.returncode != 0 or not combined_path.exists():
            raise RuntimeError("Could not assemble Edge TTS lines: " + (run.stderr or "")[-1200:])

        assets = []
        subtitle_blocks = []
        cumulative = 0.0
        subtitle_index = 0
        for index, (audio_path, srt, segment) in enumerate(generated, start=1):
            worker.raise_if_cancelled()
            duration = float(MP3(str(audio_path)).info.length)
            if srt.strip():
                shifted, subtitle_index = _shift_srt(srt, cumulative, subtitle_index)
                if shifted.strip():
                    subtitle_blocks.append(shifted.rstrip())
            drive_file = worker.upload_resumable(audio_path, audio_folder, "audio/mpeg")
            assets.append({
                "name": drive_file.get("name") or audio_path.name,
                "mime_type": "audio/mpeg",
                "file_size": int(drive_file.get("size", audio_path.stat().st_size)),
                "drive_file_id": drive_file["id"],
                "drive_path": f"Projects/{project_name}/" + (f"Episodes/{episode_title}/" if episode.get("id") else "") + "Dialogue & Narration",
                "source_type": "generated",
                "metadata": {
                    "purpose": "dialogue_line", "task": "audio_generation", "model_id": "edge-tts",
                    "speaker": segment["speaker"], "voice_id": segment["voice_id"],
                    "text": segment["text"], "speed": segment["speed"], "duration_seconds": round(duration, 3),
                },
            })
            cumulative += duration + (0.38 if index < len(generated) else 0.0)

            if srt.strip():
                line_srt_path = audio_path.with_suffix(".srt")
                line_srt_path.write_text(srt, encoding="utf-8")
                srt_info = worker.upload_resumable(line_srt_path, audio_folder, "application/x-subrip")
                assets.append({
                    "name": srt_info.get("name") or line_srt_path.name,
                    "mime_type": "application/x-subrip",
                    "file_size": int(srt_info.get("size", line_srt_path.stat().st_size)),
                    "drive_file_id": srt_info["id"],
                    "drive_path": f"Projects/{project_name}/" + (f"Episodes/{episode_title}/" if episode.get("id") else "") + "Dialogue & Narration",
                    "source_type": "generated",
                    "metadata": {"purpose": "dialogue_subtitles", "task": "audio_generation", "speaker": segment["speaker"], "voice_id": segment["voice_id"]},
                })
            worker.update_progress(job_id, 78 + (index / len(generated)) * 12, f"Uploading Edge voice line {index}/{len(generated)}")

        combined_info = worker.upload_resumable(combined_path, audio_folder, "audio/mpeg")
        assets.append({
            "name": combined_info.get("name") or combined_path.name,
            "mime_type": "audio/mpeg",
            "file_size": int(combined_info.get("size", combined_path.stat().st_size)),
            "drive_file_id": combined_info["id"],
            "drive_path": f"Projects/{project_name}/" + (f"Episodes/{episode_title}/" if episode.get("id") else "") + "Dialogue & Narration",
            "source_type": "rendered",
            "metadata": {"purpose": "combined_dialogue_track", "task": "audio_generation", "model_id": "edge-tts", "segment_count": len(generated)},
        })

        if subtitle_blocks:
            combined_srt = work_dir / "nellwick_dialogue_subtitles.srt"
            combined_srt.write_text("\n\n".join(subtitle_blocks) + "\n", encoding="utf-8")
            srt_info = worker.upload_resumable(combined_srt, audio_folder, "application/x-subrip")
            assets.append({
                "name": srt_info.get("name") or combined_srt.name,
                "mime_type": "application/x-subrip",
                "file_size": int(srt_info.get("size", combined_srt.stat().st_size)),
                "drive_file_id": srt_info["id"],
                "drive_path": f"Projects/{project_name}/" + (f"Episodes/{episode_title}/" if episode.get("id") else "") + "Dialogue & Narration",
                "source_type": "rendered",
                "metadata": {"purpose": "combined_word_timed_subtitles", "task": "audio_generation", "model_id": "edge-tts", "segment_count": len(generated)},
            })

        worker.raise_if_cancelled()
        worker.update_progress(job_id, 97, "Registering Edge dialogue and timed subtitles")
        worker.api("POST", "/api/worker/complete", json={
            "job_id": job_id,
            "assets": assets,
            "result": {
                "task": "audio_generation", "model_id": "edge-tts",
                "segment_count": len(generated), "combined_track_drive_file_id": combined_info["id"],
                "duration_seconds": round(cumulative, 3), "word_timed_subtitles": bool(subtitle_blocks),
            },
        })
        print(f"Edge TTS job completed: {len(generated)} lines with word-timed subtitle assets.")
    finally:
        import gc
        gc.collect()


def process_kokoro_audio_job(worker: Any, job: dict[str, Any]) -> None:
    """Dispatch local Kokoro or optional online Edge TTS for this audio job."""
    manifest = job.get("manifest") or {}
    if manifest.get("engine", "kokoro") == "edge-tts":
        process_edge_tts_audio_job(worker, job)
        return

    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    job_id = job["id"]
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
