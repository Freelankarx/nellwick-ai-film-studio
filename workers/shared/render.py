"""Low-memory FFmpeg rendering tasks for NELLWICK ORIGINALS.

All source media is fetched from the connected personal Google Drive using the
existing worker OAuth bridge. Supabase stores only IDs, job state and metadata.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _safe_name(value: str, fallback: str = "nellwick_render") -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value)).strip("._-")
    return (name or fallback)[:90]


def _run(command: list[str], label: str, timeout: int = 3600) -> None:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed: {(result.stderr or result.stdout)[-2200:]}")


def _validate_mp4(path: Path) -> None:
    if not path.exists() or path.stat().st_size < 20_000:
        raise RuntimeError("FFmpeg did not produce a valid, non-empty MP4.")
    _run([
        _ffmpeg(), "-v", "error", "-i", str(path),
        "-map", "0:v:0", "-f", "null", "-"
    ], "Final video validation", 180)


def _escape_filter_path(path: Path) -> str:
    value = str(path.resolve()).replace("\\", "/")
    value = value.replace(":", r"\:").replace("'", r"\'")
    return value


def _render_clip(
    source: Path,
    output: Path,
    mime_type: str,
    duration: float,
    width: int,
    height: int,
    source_start: float = 0,
    motion: str = "slow_zoom",
) -> None:
    ffmpeg = _ffmpeg()
    output.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.25, min(600.0, float(duration)))
    fps = 24
    if mime_type.startswith("image/"):
        frames = max(1, math.ceil(duration * fps))
        if motion == "static":
            vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},fps={fps},setsar=1,format=yuv420p"
        else:
            # A small, slow Ken Burns move gives still frames subtle motion without a GPU.
            vf = (
                f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},"
                f"zoompan=z='min(zoom+0.00035,1.10)':d=1:"
                f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                f"s={width}x{height}:fps={fps},setsar=1,format=yuv420p"
            )
        command = [
            ffmpeg, "-y", "-threads", "2", "-loop", "1", "-i", str(source),
            "-t", f"{duration:.3f}", "-vf", vf,
            "-an", "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "22", "-threads", "2", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(output),
        ]
    elif mime_type.startswith("video/"):
        vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},fps={fps},setsar=1,format=yuv420p"
        command = [
            ffmpeg, "-y", "-threads", "2",
            "-ss", f"{max(0.0, float(source_start)):.3f}", "-i", str(source),
            "-t", f"{duration:.3f}", "-vf", vf,
            "-an", "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "22", "-threads", "2", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(output),
        ]
    else:
        raise ValueError(f"Timeline clip is not an image or video: {mime_type}")
    _run(command, f"Timeline clip render ({source.name})", max(300, int(duration * 90)))
    if output.stat().st_size < 5_000:
        raise RuntimeError(f"Rendered clip is unexpectedly small: {source.name}")


def _concat_video(clips: list[Path], output: Path) -> None:
    if not clips:
        raise RuntimeError("The episode timeline contains no rendered clips.")
    if len(clips) == 1:
        import shutil
        shutil.copy2(clips[0], output)
        return
    list_file = output.parent / "episode_concat.txt"
    lines = []
    for clip in clips:
        escaped = str(clip.resolve()).replace("'", r"'\''")
        lines.append("file '" + escaped + "'")
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _run([
        _ffmpeg(), "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy", "-movflags", "+faststart", str(output)
    ], "Episode video assembly", 1200)


def _mix_audio(
    video_path: Path,
    audio_tracks: list[dict[str, Any]],
    subtitle_path: Path | None,
    output_path: Path,
    total_duration: float,
) -> None:
    ffmpeg = _ffmpeg()
    command = [ffmpeg, "-y", "-threads", "2", "-i", str(video_path)]
    inputs: list[dict[str, Any]] = []
    for track in audio_tracks:
        local = Path(track["local_path"])
        if track.get("loop"):
            command.extend(["-stream_loop", "-1"])
        command.extend(["-i", str(local)])
        inputs.append(track)

    filter_parts: list[str] = []
    audio_labels: list[str] = []
    for index, track in enumerate(inputs, start=1):
        label = f"a{index}"
        start = max(0.0, float(track.get("start_seconds", 0)))
        trim_start = max(0.0, float(track.get("source_start_seconds", 0)))
        requested_duration = float(track.get("duration_seconds") or max(0.25, total_duration - start))
        volume = max(0.0, min(2.0, float(track.get("volume", 1.0))))
        delay_ms = int(start * 1000)
        filter_parts.append(
            f"[{index}:a]atrim=start={trim_start:.3f}:duration={requested_duration:.3f},"
            f"asetpts=PTS-STARTPTS,volume={volume:.3f},adelay={delay_ms}|{delay_ms}[{label}]"
        )
        audio_labels.append(f"[{label}]")

    if audio_labels:
        filter_parts.append(
            "".join(audio_labels)
            + f"amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=2,"
            + f"apad,atrim=duration={total_duration:.3f}[aout]"
        )
        command.extend(["-filter_complex", ";".join(filter_parts), "-map", "0:v:0", "-map", "[aout]"])
    else:
        command.extend(["-map", "0:v:0", "-an"])

    if subtitle_path and subtitle_path.exists():
        # A second pass burns subtitles to avoid rebuilding/re-encoding the audio filter graph.
        temp = output_path.with_name(output_path.stem + "_nosubs.mp4")
        command.extend(["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total_duration:.3f}", str(temp)])
        _run(command, "Episode audio mix", 1800)
        subtitle_filter = (
            f"subtitles='{_escape_filter_path(subtitle_path)}':"
            "force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=30'"
        )
        _run([
            ffmpeg, "-y", "-threads", "2", "-i", str(temp),
            "-vf", subtitle_filter, "-map", "0:v:0", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "copy", "-pix_fmt", "yuv420p", "-t", f"{total_duration:.3f}",
            "-movflags", "+faststart", str(output_path),
        ], "Subtitle burn-in", 1800)
        temp.unlink(missing_ok=True)
    else:
        command.extend([
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", f"{total_duration:.3f}", "-movflags", "+faststart", str(output_path),
        ])
        _run(command, "Episode audio mix", 1800)


def process_episode_render_job(worker: Any, job: dict[str, Any]) -> None:
    job_id = job["id"]
    manifest = job.get("manifest") or {}
    project = manifest.get("project") or {}
    episode = manifest.get("episode") or {}
    clips = manifest.get("clips") or []
    audio_tracks = manifest.get("audio_tracks") or []
    settings = manifest.get("settings") or {}
    if not clips:
        raise RuntimeError("Episode render manifest contains no timeline clips.")
    if not audio_tracks:
        raise RuntimeError("Episode render needs at least one dialogue, narration, music or sound-effects track. Refusing to export a silent film.")

    ratio = str(settings.get("aspect_ratio") or "16:9")
    width, height = (720, 1280) if ratio == "9:16" else ((1080, 1080) if ratio == "1:1" else (1280, 720))
    project_name = str(project.get("name") or "NELLWICK Project")
    episode_title = str(episode.get("title") or "Episode")
    worker.unload_wan()
    worker.unload_qwen()
    worker.unload_sdxl()
    worker.unload_ltx()

    work_dir = Path(tempfile.mkdtemp(prefix="nellwick_episode_render_"))
    if not worker.root_folder_id:
        worker.get_drive_credentials()
    projects_folder = worker.ensure_folder("Projects", worker.root_folder_id)
    project_folder = worker.ensure_folder(project_name[:100], projects_folder)
    episodes_folder = worker.ensure_folder("Episodes", project_folder)
    episode_folder = worker.ensure_folder(episode_title[:100], episodes_folder)
    workspace = worker.ensure_folder("Render Workspace", episode_folder)
    exports = worker.ensure_folder("Final Exports", episode_folder)

    result_state = job.get("result") or {}
    saved_segments = result_state.get("completed_segments", [])
    saved_by_id = {str(item.get("clip_id")): item for item in saved_segments if item.get("clip_id")}
    rendered_paths: list[Path] = []
    segment_assets: list[dict[str, Any]] = []
    ordered = sorted(clips, key=lambda item: (float(item.get("start_seconds", 0)), int(item.get("order", 0))))

    for index, clip in enumerate(ordered, start=1):
        worker.raise_if_cancelled()
        clip_id = str(clip["id"])
        output = work_dir / f"segment_{index:04d}.mp4"
        saved = saved_by_id.get(clip_id)
        if saved and saved.get("drive_file_id"):
            worker.update_progress(job_id, ((index - 1) / len(ordered)) * 70, f"Restoring rendered segment {index}/{len(ordered)} from Drive")
            worker.download_drive_file(saved["drive_file_id"], output)
        else:
            source_path = work_dir / f"source_{index:04d}"
            worker.update_progress(job_id, ((index - 1) / len(ordered)) * 70 + 1, f"Downloading timeline media {index}/{len(ordered)}")
            worker.download_drive_file(str(clip["drive_file_id"]), source_path)
            _render_clip(
                source_path, output, str(clip["mime_type"]),
                float(clip["duration_seconds"]), width, height,
                float(clip.get("source_start_seconds", 0)), str(clip.get("motion") or "slow_zoom")
            )
            worker.raise_if_cancelled()
            info = worker.upload_resumable(output, workspace, "video/mp4")
            checkpoint = {
                "clip_id": clip_id,
                "drive_file_id": info["id"],
                "name": info.get("name") or output.name,
                "duration_seconds": float(clip["duration_seconds"]),
            }
            saved_segments.append(checkpoint)
            saved_by_id[clip_id] = checkpoint
            worker.update_progress(
                job_id, (index / len(ordered)) * 70,
                f"Rendered and checkpointed segment {index}/{len(ordered)}",
                {"completed_segments": saved_segments},
            )
        _validate_mp4(output)
        rendered_paths.append(output)

    worker.raise_if_cancelled()
    worker.update_progress(job_id, 73, "Assembling the picture edit")
    picture = work_dir / "episode_picture.mp4"
    _concat_video(rendered_paths, picture)
    total_duration = sum(float(item["duration_seconds"]) for item in ordered)

    downloaded_tracks = []
    for index, track in enumerate(audio_tracks, start=1):
        worker.raise_if_cancelled()
        local = work_dir / f"audio_{index:03d}"
        worker.update_progress(job_id, 75 + index / max(1, len(audio_tracks)) * 8, f"Downloading audio track {index}/{len(audio_tracks)}")
        worker.download_drive_file(str(track["drive_file_id"]), local)
        track_copy = dict(track)
        track_copy["local_path"] = str(local)
        downloaded_tracks.append(track_copy)

    subtitle_path = None
    subtitle = manifest.get("subtitle")
    if isinstance(subtitle, dict) and subtitle.get("drive_file_id"):
        subtitle_path = work_dir / "episode_subtitles.srt"
        worker.download_drive_file(str(subtitle["drive_file_id"]), subtitle_path)

    master = work_dir / (_safe_name(episode_title, "nellwick_episode") + ".mp4")
    worker.update_progress(job_id, 86, "Mixing dialogue, music and effects")
    _mix_audio(picture, downloaded_tracks, subtitle_path, master, total_duration)
    _validate_mp4(master)

    worker.raise_if_cancelled()
    worker.update_progress(job_id, 94, "Uploading final episode master")
    final_info = worker.upload_resumable(master, exports, "video/mp4")
    asset = {
        "name": final_info.get("name") or master.name,
        "mime_type": "video/mp4",
        "file_size": int(final_info.get("size", master.stat().st_size)),
        "drive_file_id": final_info["id"],
        "drive_path": f"Projects/{project_name}/Episodes/{episode_title}/Final Exports",
        "source_type": "rendered",
        "metadata": {
            "task": "episode_render",
            "renderer": "FFmpeg",
            "aspect_ratio": ratio,
            "width": width,
            "height": height,
            "duration_seconds": round(total_duration, 3),
            "clip_count": len(ordered),
            "audio_track_count": len(audio_tracks),
            "subtitle_burned": bool(subtitle_path),
        },
    }
    worker.update_progress(job_id, 98, "Registering final episode in the Media Library")
    worker.api("POST", "/api/worker/complete", json={
        "job_id": job_id,
        "assets": [asset],
        "result": {
            "task": "episode_render",
            "master_drive_file_id": final_info["id"],
            "completed_segments": saved_segments,
            "duration_seconds": round(total_duration, 3),
            "clip_count": len(ordered),
        },
    })
    print("NELLWICK episode master completed:", final_info.get("name"))


def process_short_render_job(worker: Any, job: dict[str, Any]) -> None:
    job_id = job["id"]
    manifest = job.get("manifest") or {}
    project = manifest.get("project") or {}
    episode = manifest.get("episode") or {}
    source = manifest.get("source") or {}
    title = _safe_name(str(manifest.get("title") or "nellwick_short"), "nellwick_short")
    duration = max(1.0, min(180.0, float(manifest.get("duration_seconds", 30))))
    start = max(0.0, float(manifest.get("start_seconds", 0)))
    worker.unload_wan()
    worker.unload_qwen()
    worker.unload_sdxl()
    worker.unload_ltx()
    work_dir = Path(tempfile.mkdtemp(prefix="nellwick_short_render_"))

    worker.update_progress(job_id, 5, "Downloading source episode footage")
    source_path = work_dir / "short_source.mp4"
    worker.download_drive_file(str(source["drive_file_id"]), source_path)
    worker.raise_if_cancelled()

    output = work_dir / f"{title}.mp4"
    ffmpeg = _ffmpeg()
    vf = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p"
    worker.update_progress(job_id, 35, "Reframing and rendering vertical 9:16 Short")
    _run([
        ffmpeg, "-y", "-threads", "2", "-ss", f"{start:.3f}", "-i", str(source_path),
        "-t", f"{duration:.3f}", "-vf", vf, "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-threads", "2",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", str(output)
    ], "Vertical Short render", max(180, int(duration * 60)))
    _validate_mp4(output)

    project_name = str(project.get("name") or "NELLWICK Project")
    episode_title = str(episode.get("title") or "Shorts")
    if not worker.root_folder_id:
        worker.get_drive_credentials()
    projects_folder = worker.ensure_folder("Projects", worker.root_folder_id)
    project_folder = worker.ensure_folder(project_name[:100], projects_folder)
    episodes_folder = worker.ensure_folder("Episodes", project_folder)
    episode_folder = worker.ensure_folder(episode_title[:100], episodes_folder)
    shorts_folder = worker.ensure_folder("Shorts · 9x16", episode_folder)

    worker.raise_if_cancelled()
    worker.update_progress(job_id, 90, "Uploading vertical Short")
    file_info = worker.upload_resumable(output, shorts_folder, "video/mp4")
    asset = {
        "name": file_info.get("name") or output.name,
        "mime_type": "video/mp4",
        "file_size": int(file_info.get("size", output.stat().st_size)),
        "drive_file_id": file_info["id"],
        "drive_path": f"Projects/{project_name}/Episodes/{episode_title}/Shorts · 9x16",
        "source_type": "rendered",
        "metadata": {
            "task": "short_render",
            "source_asset_id": source.get("asset_id"),
            "start_seconds": start,
            "duration_seconds": duration,
            "aspect_ratio": "9:16",
            "renderer": "FFmpeg",
            "audio_source": "source_video",
        },
    }
    worker.update_progress(job_id, 98, "Registering finished Short in Media Library")
    worker.api("POST", "/api/worker/complete", json={
        "job_id": job_id, "assets": [asset],
        "result": {"task": "short_render", "short_drive_file_id": file_info["id"], "duration_seconds": duration},
    })
    print("NELLWICK vertical Short completed:", file_info.get("name"))
