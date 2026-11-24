"""Experimental local MuseTalk 1.5 talking-character adapter.

Runs MuseTalk in an isolated Python 3.10 environment so it cannot downgrade
NELLWICK's primary Kaggle Python/PyTorch runtime.
"""
from __future__ import annotations

import gc
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path
from typing import Any


MUSETALK_REPO = "https://github.com/TMElyralab/MuseTalk.git"
MUSETALK_VERSION = "v15"


def _run(command: list[str], label: str, *, cwd: Path | None = None, timeout: int = 3600, env: dict[str, str] | None = None) -> str:
    print(f"[MuseTalk] {label}")
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.stdout:
        print(result.stdout[-5000:])
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "No process output")[-7000:]
        raise RuntimeError(f"MuseTalk step failed ({label}): {detail}")
    return result.stdout


def _workspace() -> Path:
    for candidate in (Path("/kaggle/working"), Path("/content"), Path.cwd()):
        if candidate.exists() and candidate.is_dir():
            return candidate / "nellwick_musetalk_runtime"
    return Path(tempfile.gettempdir()) / "nellwick_musetalk_runtime"


def _venv_python(venv: Path) -> Path:
    return venv / "bin" / "python"


def _ensure_environment(worker: Any, job_id: str) -> tuple[Path, Path, Path]:
    root = _workspace()
    repo_dir = root / "MuseTalk"
    venv = root / "venv"
    models = repo_dir / "models"
    python = _venv_python(venv)
    marker = root / ".environment_ready"

    root.mkdir(parents=True, exist_ok=True)
    if not repo_dir.exists():
        _run(["git", "clone", "--depth", "1", MUSETALK_REPO, str(repo_dir)], "Cloning official MuseTalk repository", timeout=900)
    if not shutil.which("uv"):
        _run([sys.executable, "-m", "pip", "install", "--quiet", "uv"], "Installing isolated Python environment manager", timeout=600)
    if not shutil.which("uv"):
        raise RuntimeError("The uv environment manager could not be installed in this Kaggle session.")

    if not python.exists():
        _run(["uv", "python", "install", "3.10"], "Installing Python 3.10 for MuseTalk", timeout=900)
        _run(["uv", "venv", "--python", "3.10", str(venv)], "Creating isolated MuseTalk virtual environment", timeout=300)
        if not python.exists():
            raise RuntimeError("The isolated MuseTalk Python 3.10 environment was not created.")

    if not marker.exists():
        worker.update_progress(job_id, 5, "Installing isolated MuseTalk runtime (Python 3.10 / CUDA 11.8)")
        _run([
            "uv", "pip", "install", "--python", str(python),
            "--index-url", "https://pypi.org/simple",
            "--extra-index-url", "https://download.pytorch.org/whl/cu118",
            "torch==2.0.1+cu118", "torchvision==0.15.2+cu118",
        ], "Installing isolated CUDA PyTorch", timeout=1800)

        _run([
            "uv", "pip", "install", "--python", str(python),
            "numpy==1.23.5",
            "diffusers==0.30.2",
            "accelerate==0.28.0",
            "opencv-python==4.9.0.80",
            "soundfile==0.12.1",
            "transformers==4.39.2",
            "huggingface_hub==0.30.2",
            "librosa==0.11.0",
            "einops==0.8.1",
            "omegaconf",
            "ffmpeg-python",
            "moviepy",
            "gdown",
            "requests",
            "imageio",
            "tqdm",
            "Pillow",
            "PyYAML",
            "face-alignment==1.4.1",
            "openmim",
        ], "Installing MuseTalk inference dependencies", timeout=2400)

        mim = venv / "bin" / "mim"
        if not mim.exists():
            raise RuntimeError("OpenMIM did not install its 'mim' command.")
        _run([str(mim), "install", "mmengine"], "Installing MMEngine", timeout=1200)
        _run([str(mim), "install", "mmcv==2.0.1"], "Installing compiled MMCV 2.0.1", timeout=1800)
        _run([str(mim), "install", "mmdet==3.1.0"], "Installing MMDetection 3.1.0", timeout=1200)
        _run([str(mim), "install", "mmpose==1.1.0"], "Installing MMPose 1.1.0", timeout=1800)

        _run([
            str(python), "-c",
            "import torch,cv2,diffusers,transformers,mmcv,mmpose; "
            "assert torch.cuda.is_available(), 'MuseTalk requires a Kaggle/Colab GPU runtime'; "
            "print('Python runtime imports OK'); "
            "print('torch',torch.__version__,'cuda',torch.cuda.is_available(),torch.cuda.get_device_name(0)); "
            "print('mmcv',mmcv.__version__)",
        ], "Verifying isolated MuseTalk runtime", timeout=300)
        marker.write_text("ready\n", encoding="utf-8")

    models.mkdir(parents=True, exist_ok=True)
    return root, repo_dir, python


def _download_models(worker: Any, job_id: str, repo_dir: Path, python: Path) -> None:
    models = repo_dir / "models"
    required = [
        models / "musetalkV15" / "unet.pth",
        models / "musetalkV15" / "musetalk.json",
        models / "sd-vae" / "config.json",
        models / "sd-vae" / "diffusion_pytorch_model.bin",
        models / "whisper" / "config.json",
        models / "whisper" / "pytorch_model.bin",
        models / "whisper" / "preprocessor_config.json",
        models / "dwpose" / "dw-ll_ucoco_384.pth",
        models / "face-parse-bisent" / "79999_iter.pth",
        models / "face-parse-bisent" / "resnet18-5c106cde.pth",
    ]
    if all(path.exists() and path.stat().st_size > 100_000 for path in required):
        return

    worker.update_progress(job_id, 12, "Downloading MuseTalk and supporting model weights from Hugging Face")
    models.mkdir(parents=True, exist_ok=True)
    download_code = r"""
from huggingface_hub import snapshot_download
from pathlib import Path
root = Path("models")
snapshot_download(
    repo_id="TMElyralab/MuseTalk",
    local_dir=str(root),
    allow_patterns=["musetalkV15/**"],
)
snapshot_download(
    repo_id="stabilityai/sd-vae-ft-mse",
    local_dir=str(root / "sd-vae"),
    allow_patterns=["config.json", "diffusion_pytorch_model.bin"],
)
snapshot_download(
    repo_id="openai/whisper-tiny",
    local_dir=str(root / "whisper"),
    allow_patterns=["config.json", "pytorch_model.bin", "preprocessor_config.json"],
)
snapshot_download(
    repo_id="yzd-v/DWPose",
    local_dir=str(root / "dwpose"),
    allow_patterns=["dw-ll_ucoco_384.pth"],
)
"""
    _run([str(python), "-c", download_code], "Downloading MuseTalk, SD-VAE, Whisper and DWPose weights", cwd=repo_dir, timeout=2400)

    face_dir = models / "face-parse-bisent"
    face_dir.mkdir(parents=True, exist_ok=True)
    gdown_weights = face_dir / "79999_iter.pth"
    if not gdown_weights.exists() or gdown_weights.stat().st_size < 10_000_000:
        _run([str(python), "-m", "gdown", "--id", "154JgKpzCPW82qINcVieuPH3fZ2e0P812", "-O", str(gdown_weights)],
             "Downloading face parsing checkpoint", timeout=900)

    resnet = face_dir / "resnet18-5c106cde.pth"
    if not resnet.exists() or resnet.stat().st_size < 10_000_000:
        _run([str(python), "-c",
              "import urllib.request; urllib.request.urlretrieve('https://download.pytorch.org/models/resnet18-5c106cde.pth', r'" + str(resnet) + "')"],
             "Downloading ResNet18 face-parser backbone", timeout=600)

    missing = [str(path) for path in required if not path.exists() or path.stat().st_size < 100_000]
    if missing:
        raise RuntimeError("MuseTalk model download is incomplete: " + ", ".join(missing))


def validate_talking_shot_duration(seconds: float) -> float:
    """MuseTalk jobs are individual dialogue shots, not full episode dubbing."""
    value = float(seconds)
    if value < 0.8 or value > 60:
        raise ValueError("MuseTalk talking-character shots must be between 0.8 and 60 seconds.")
    return value


def _audio_duration(audio_path: Path) -> float:
    try:
        with wave.open(str(audio_path), "rb") as wav:
            seconds = wav.getnframes() / float(wav.getframerate())
            if seconds > 0:
                return seconds
    except Exception:
        pass
    try:
        from mutagen import File as MutagenFile
        item = MutagenFile(str(audio_path))
        if item and item.info and float(item.info.length) > 0:
            return float(item.info.length)
    except Exception as exc:
        raise RuntimeError("Could not read the dialogue audio duration. Use MP3 or WAV audio.") from exc
    raise RuntimeError("Could not read a positive duration from the dialogue audio.")


def process_musetalk_lip_sync_job(worker: Any, job: dict[str, Any]) -> None:
    """Create a talking-character shot from a project-owned still and audio asset."""
    import imageio_ffmpeg

    manifest = job.get("manifest") or {}
    project = manifest.get("project") or {}
    episode = manifest.get("episode") or {}
    source = manifest.get("portrait") or {}
    audio = manifest.get("audio") or {}
    character = manifest.get("character") or {}
    if not source.get("drive_file_id") or not audio.get("drive_file_id"):
        raise RuntimeError("MuseTalk job needs both a saved portrait image and dialogue audio.")

    worker.unload_ltx()
    worker.unload_wan()
    worker.unload_qwen()
    worker.unload_sdxl()
    job_id = job["id"]
    work_dir = Path(tempfile.mkdtemp(prefix="nellwick_musetalk_"))
    root, repo_dir, python = _ensure_environment(worker, job_id)
    _download_models(worker, job_id, repo_dir, python)

    portrait_path = work_dir / "character_portrait.png"
    audio_suffix = Path(str(audio.get("name") or "dialogue")).suffix.lower()
    if audio_suffix not in {".wav", ".mp3", ".m4a", ".flac"}:
        audio_suffix = ".mp3" if audio.get("mime_type") == "audio/mpeg" else ".wav"
    audio_path = work_dir / f"dialogue{audio_suffix}"
    worker.update_progress(job_id, 40, "Downloading approved character portrait and dialogue audio")
    worker.download_drive_file(str(source["drive_file_id"]), portrait_path)
    worker.download_drive_file(str(audio["drive_file_id"]), audio_path)
    from PIL import Image
    normalized_portrait = work_dir / "character_portrait_normalized.png"
    with Image.open(portrait_path) as opened:
        portrait = opened.convert("RGB")
        portrait.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        portrait.save(normalized_portrait, format="PNG", optimize=True)
    portrait_path = normalized_portrait
    duration = _audio_duration(audio_path)
    try:
        duration = validate_talking_shot_duration(duration)
    except ValueError as exc:
        raise RuntimeError(str(exc) + " Use it for individual dialogue shots, not an entire episode.") from exc

    source_video = work_dir / "still_portrait_source.mp4"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    render_source = subprocess.run([
        ffmpeg, "-y", "-loop", "1", "-framerate", "25", "-i", str(portrait_path),
        "-t", f"{duration:.3f}", "-an", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "20", "-pix_fmt", "yuv420p", "-r", "25", str(source_video),
    ], capture_output=True, text=True, timeout=max(120, int(duration * 30)))
    if render_source.returncode != 0 or not source_video.exists() or source_video.stat().st_size < 10_000:
        raise RuntimeError("Could not prepare the portrait video for MuseTalk: " + (render_source.stderr or "")[-1200:])

    config = work_dir / "musetalk_input.json"
    config.write_text(json.dumps({
        "task_0": {
            "video_path": str(source_video),
            "audio_path": str(audio_path),
            "result_name": "nellwick_talking_character.mp4",
            "bbox_shift": 0,
        }
    }, indent=2), encoding="utf-8")

    results_dir = work_dir / "results"
    output_path = results_dir / "v15" / "nellwick_talking_character.mp4"
    worker.update_progress(job_id, 48, "Running MuseTalk 1.5 FP16 lip-sync inference")
    command = [
        str(python), "-m", "scripts.inference",
        "--inference_config", str(config),
        "--result_dir", str(results_dir),
        "--unet_model_path", str(repo_dir / "models" / "musetalkV15" / "unet.pth"),
        "--unet_config", str(repo_dir / "models" / "musetalkV15" / "musetalk.json"),
        "--whisper_dir", str(repo_dir / "models" / "whisper"),
        "--version", "v15",
        "--fps", "25",
        "--batch_size", "4",
        "--use_float16",
        "--ffmpeg_path", str(Path(ffmpeg).parent),
    ]
    inference_env = os.environ.copy()
    inference_env["CUDA_VISIBLE_DEVICES"] = "0"
    inference_env["OMP_NUM_THREADS"] = "2"
    ffmpeg_bin_dir = work_dir / "bin"
    ffmpeg_bin_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg_link = ffmpeg_bin_dir / "ffmpeg"
    if not ffmpeg_link.exists():
        ffmpeg_link.symlink_to(Path(ffmpeg))
    try:
        _run(command, "Generating lip-synchronised character clip", cwd=repo_dir,
             timeout=max(900, int(duration * 300)), env=inference_env)
    except Exception:
        if output_path.exists():
            output_path.unlink()
        raise

    worker.raise_if_cancelled()
    if not output_path.exists() or output_path.stat().st_size < 20_000:
        raise RuntimeError("MuseTalk did not produce a valid output clip. The upstream inference script can log task errors without failing its process; check the Kaggle output above.")

    validation = subprocess.run([
        ffmpeg, "-v", "error", "-i", str(output_path),
        "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"
    ], capture_output=True, text=True, timeout=180)
    if validation.returncode != 0:
        raise RuntimeError("MuseTalk output failed FFmpeg validation: " + validation.stderr[-1200:])

    project_name = str(project.get("name") or "NELLWICK Project")
    episode_title = str(episode.get("title") or "Talking Character Tests")
    if not worker.root_folder_id:
        worker.get_drive_credentials()
    projects_folder = worker.ensure_folder("Projects", worker.root_folder_id)
    project_folder = worker.ensure_folder(project_name[:100], projects_folder)
    episodes_folder = worker.ensure_folder("Episodes", project_folder)
    episode_folder = worker.ensure_folder(episode_title[:100], episodes_folder)
    talking_folder = worker.ensure_folder("Talking Character Shots", episode_folder)

    worker.raise_if_cancelled()
    worker.update_progress(job_id, 92, "Uploading lip-synchronised character shot")
    file_info = worker.upload_resumable(output_path, talking_folder, "video/mp4")
    asset = {
        "name": file_info.get("name") or output_path.name,
        "mime_type": "video/mp4",
        "file_size": int(file_info.get("size", output_path.stat().st_size)),
        "drive_file_id": file_info["id"],
        "drive_path": f"Projects/{project_name}/Episodes/{episode_title}/Talking Character Shots",
        "source_type": "generated",
        "metadata": {
            "task": "lip_sync",
            "model_id": "musetalk-1.5",
            "character_id": character.get("id"),
            "character_name": character.get("name"),
            "portrait_asset_id": source.get("asset_id"),
            "audio_asset_id": audio.get("asset_id"),
            "duration_seconds": round(duration, 3),
            "fps": 25,
            "precision": "fp16",
            "experimental": True,
        },
    }
    worker.update_progress(job_id, 98, "Registering talking-character clip")
    worker.api("POST", "/api/worker/complete", json={
        "job_id": job_id,
        "assets": [asset],
        "result": {
            "task": "lip_sync",
            "model_id": "musetalk-1.5",
            "output_drive_file_id": file_info["id"],
            "duration_seconds": round(duration, 3),
            "fps": 25,
            "experimental": True,
        },
    })
    print("MuseTalk lip-sync completed:", file_info.get("name"))
