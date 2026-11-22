#!/usr/bin/env python3
"""NELLWICK notebook worker. Runs as an interactive batch client, not a hosted server."""
from __future__ import annotations
import argparse, json, os, sys, time, subprocess, tempfile, traceback, math, threading
from pathlib import Path
from typing import Any
import requests

CHUNK_SIZE = 8 * 1024 * 1024
WAN_MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"

class StudioError(RuntimeError):
    pass

class NELLWICKWorker:
    def __init__(self, studio_url: str, token: str, worker_label: str, max_jobs: int = 2):
        self.base = studio_url.rstrip("/")
        self.token = token.strip()
        self.label = worker_label
        self.max_jobs = max_jobs
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.token}", "User-Agent": "NELLWICK-Notebook-Worker/0.1"})
        self.drive_token = None
        self.root_folder_id = None
        self.pipe = None
        self.ffmpeg = None

    def api(self, method: str, path: str, **kwargs):
        response = self.session.request(method, self.base + path, timeout=90, **kwargs)
        try: data = response.json()
        except Exception: data = {"message": response.text[:500]}
        if not response.ok:
            raise StudioError(data.get("error") or data.get("message") or f"Studio API failed: {response.status_code}")
        return data

    def preflight(self):
        import torch
        print("NELLWICK worker preflight")
        print("Python:", sys.version.split()[0])
        print("PyTorch:", torch.__version__)
        print("CUDA available:", torch.cuda.is_available())
        if not torch.cuda.is_available():
            raise StudioError("No CUDA GPU is attached. Enable GPU in Kaggle settings or choose a GPU runtime in Colab.")
        props = torch.cuda.get_device_properties(0)
        print("GPU:", props.name)
        print("GPU memory:", round(props.total_memory / 1024**3, 2), "GiB")
        print("Compute capability:", f"{props.major}.{props.minor}")
        if props.total_memory < 12 * 1024**3:
            raise StudioError("This Diffusers Wan preset is memory-sensitive. Current Diffusers guidance is around 13 GB for the T2V pipeline; this worker requires at least 12 GiB and 16 GiB is preferred. Select a larger GPU or use a future lightweight image-motion adapter.")
        if props.total_memory < 15 * 1024**3:
            print("WARNING: GPU memory is below 15 GiB. CPU offload is enabled, but out-of-memory failures remain possible.")
        print("System RAM and session availability vary by notebook provider.")

    def get_drive_credentials(self):
        data = self.api("GET", "/api/worker/drive-token")
        self.drive_token = data["access_token"]
        self.root_folder_id = data["root_folder_id"]
        return self.drive_token

    def drive_request(self, method, url, **kwargs):
        if not self.drive_token:
            self.get_drive_credentials()
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.drive_token}"
        response = requests.request(method, url, headers=headers, timeout=180, **kwargs)
        if response.status_code == 401:
            self.get_drive_credentials()
            headers["Authorization"] = f"Bearer {self.drive_token}"
            response = requests.request(method, url, headers=headers, timeout=180, **kwargs)
        return response

    def ensure_folder(self, name: str, parent_id: str) -> str:
        safe_name = name.replace("'", "\'")
        query = f"name = '{safe_name}' and mimeType = 'application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed = false"
        response = self.drive_request("GET", "https://www.googleapis.com/drive/v3/files", params={"q": query, "fields": "files(id,name)", "pageSize": 100})
        if not response.ok: raise StudioError("Google Drive folder lookup failed: " + response.text[:300])
        items = response.json().get("files", [])
        if items: return items[0]["id"]
        response = self.drive_request("POST", "https://www.googleapis.com/drive/v3/files", json={"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id]})
        if not response.ok: raise StudioError("Google Drive folder creation failed: " + response.text[:300])
        return response.json()["id"]

    def project_folder(self, manifest: dict) -> tuple[str, str]:
        if not self.root_folder_id: self.get_drive_credentials()
        project_name = manifest.get("project", {}).get("name", "Untitled Project")
        episode_name = manifest.get("episode", {}).get("title", "Production")
        folder = self.ensure_folder("Projects", self.root_folder_id)
        folder = self.ensure_folder(project_name[:100], folder)
        folder = self.ensure_folder("Episodes", folder)
        folder = self.ensure_folder(episode_name[:100], folder)
        shots_folder = self.ensure_folder("Generated Shots", folder)
        return folder, shots_folder

    def upload_resumable(self, local_path: Path, parent_id: str, mime_type: str = "video/mp4") -> dict:
        if not self.drive_token: self.get_drive_credentials()
        metadata = {"name": local_path.name, "mimeType": mime_type, "parents": [parent_id]}
        init = self.drive_request("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink", json=metadata, headers={"X-Upload-Content-Type": mime_type, "X-Upload-Content-Length": str(local_path.stat().st_size), "Content-Type": "application/json; charset=UTF-8"})
        if not init.ok: raise StudioError("Could not start Drive upload: " + init.text[:500])
        upload_url = init.headers.get("Location")
        if not upload_url: raise StudioError("Drive did not return a resumable upload URL.")
        size = local_path.stat().st_size
        offset = 0
        retries = 0
        with local_path.open("rb") as stream:
            while offset < size:
                stream.seek(offset)
                chunk = stream.read(min(CHUNK_SIZE, size - offset))
                end = offset + len(chunk) - 1
                headers = {"Content-Length": str(len(chunk)), "Content-Range": f"bytes {offset}-{end}/{size}", "Content-Type": mime_type}
                response = self.drive_request("PUT", upload_url, data=chunk, headers=headers)
                if response.status_code in (200, 201): return response.json()
                if response.status_code == 308:
                    range_header = response.headers.get("Range", "")
                    if not range_header:
                        # Ask Drive for the authoritative committed offset; never assume
                        # every byte in the previous request reached Drive.
                        probe = self.drive_request("PUT", upload_url, data=b"", headers={"Content-Length": "0", "Content-Range": f"bytes */{size}"})
                        if probe.status_code in (200, 201): return probe.json()
                        if probe.status_code != 308:
                            raise StudioError(f"Could not query Drive upload progress ({probe.status_code}): {probe.text[:300]}")
                        range_header = probe.headers.get("Range", "")
                    offset = int(range_header.split("-")[-1]) + 1 if range_header else 0
                    retries = 0
                    continue
                if response.status_code >= 500:
                    retries += 1
                    if retries > 5:
                        raise StudioError(f"Google Drive upload repeatedly failed ({response.status_code}): {response.text[:300]}")
                    time.sleep(min(2 ** retries, 30))
                    continue
                raise StudioError(f"Drive upload failed ({response.status_code}): {response.text[:300]}")
        raise StudioError("Drive upload ended without a completed file response.")

    def download_drive_file(self, file_id: str, destination: Path):
        response = self.drive_request("GET", f"https://www.googleapis.com/drive/v3/files/{file_id}", params={"alt": "media"}, stream=True)
        if not response.ok: raise StudioError(f"Could not download checkpoint clip {file_id}: {response.status_code}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as out:
            for chunk in response.iter_content(1024 * 1024):
                if chunk: out.write(chunk)

    def load_wan(self):
        if self.pipe is not None: return
        import torch
        from diffusers import WanPipeline
        print(f"Loading {WAN_MODEL_ID}. The first run downloads model weights into the notebook cache.")
        self.pipe = WanPipeline.from_pretrained(WAN_MODEL_ID, torch_dtype=torch.float16, use_safetensors=True)
        # Model CPU offload is deliberately used for lower-memory notebook GPUs.
        self.pipe.enable_model_cpu_offload()
        if hasattr(self.pipe, "vae") and hasattr(self.pipe.vae, "enable_tiling"):
            self.pipe.vae.enable_tiling()
        self.pipe.set_progress_bar_config(disable=False)

    @staticmethod
    def frames_for_seconds(seconds: int, fps: int = 16) -> int:
        # Wan temporal sequence length follows 4n+1. Keep the first adapter within 2–5 seconds.
        return max(17, min(81, 4 * round((seconds * fps - 1) / 4) + 1))

    def generate_wan_shot(self, shot: dict, output_path: Path, settings: dict):
        import torch
        from diffusers.utils import export_to_video
        self.load_wan()
        seconds = int(max(2, min(5, shot.get("duration_seconds", 5))))
        fps = int(settings.get("fps", 16))
        width = int(settings.get("width", 832)); height = int(settings.get("height", 480))
        frames = self.frames_for_seconds(seconds, fps)
        prompt = shot.get("prompt", "")
        if not prompt.strip(): raise StudioError("A shot is missing its text prompt.")
        generator = torch.Generator(device="cpu").manual_seed(int(shot.get("seed") or int(time.time()) % 2**31))
        result = self.pipe(prompt=prompt, negative_prompt=shot.get("negative_prompt", "blurry, flicker, jitter, distorted anatomy, text, watermark"), height=height, width=width, num_frames=frames, num_inference_steps=int(shot.get("steps", 30)), guidance_scale=float(shot.get("guidance_scale", 6.0)), generator=generator)
        frames_out = result.frames[0]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        export_to_video(frames_out, str(output_path), fps=fps)
        if not output_path.exists() or output_path.stat().st_size < 100_000:
            raise StudioError("Video model returned an unexpectedly small clip. Check the model/runtime logs.")

    def assemble(self, clip_paths: list[Path], output_path: Path):
        if len(clip_paths) == 1:
            import shutil
            shutil.copy2(clip_paths[0], output_path)
            return
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        list_file = output_path.parent / "concat_list.txt"
        list_file.write_text("\n".join("file '" + str(p.resolve()).replace("'", "\\'") + "'" for p in clip_paths), encoding="utf-8")
        command = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", "-movflags", "+faststart", str(output_path)]
        run = subprocess.run(command, capture_output=True, text=True)
        if run.returncode != 0:
            raise StudioError("FFmpeg could not assemble clips: " + run.stderr[-1200:])

    def update_progress(self, job_id: str, percent: float, message: str, patch: dict | None = None):
        self.api("POST", "/api/worker/progress", json={"job_id": job_id, "progress": min(99, max(0, percent)), "message": message, "result_patch": patch or {}})
        print(f"[{percent:5.1f}%] {message}")

    def process_job(self, job: dict):
        job_id = job["id"]
        manifest = job.get("manifest") or {}
        shots = manifest.get("shots") or []
        if not shots: raise StudioError("Job manifest contains no shots.")
        project_folder, shots_folder = self.project_folder(manifest)
        result_state = job.get("result") or {}
        completed = result_state.get("completed_shots", [])
        completed_by_id = {item.get("shot_id"): item for item in completed if item.get("shot_id")}
        work_dir = Path(tempfile.mkdtemp(prefix="nellwick_job_"))
        clips = []
        assets = []
        total = len(shots)
        for index, shot in enumerate(shots, start=1):
            shot_id = shot.get("id") or f"shot_{index:03d}"
            old = completed_by_id.get(shot_id)
            local = work_dir / f"shot_{index:03d}.mp4"
            if old and old.get("drive_file_id"):
                self.download_drive_file(old["drive_file_id"], local)
                print(f"Reusing completed shot {shot_id} from Drive.")
                clips.append(local)
                assets.append({"name": old.get("name", local.name), "mime_type": "video/mp4", "file_size": local.stat().st_size, "drive_file_id": old["drive_file_id"], "drive_path": old.get("drive_path", ""), "source_type": "generated", "metadata": {"shot_id": shot_id}})
                continue
            mode = shot.get("generation_mode", "text_to_video")
            model_id = shot.get("model_id", manifest.get("settings", {}).get("model_id", "wan21-t2v-1.3b"))
            if model_id != "wan21-t2v-1.3b" or mode != "text_to_video":
                raise StudioError(f"The first notebook adapter only runs Wan 2.1 T2V 1.3B text-to-video. Job requested model={model_id}, mode={mode}.")
            progress_base = ((index - 1) / total) * 85
            self.update_progress(job_id, progress_base + 1, f"Generating shot {index}/{total}")
            self.generate_wan_shot(shot, local, manifest.get("settings", {}))
            self.update_progress(job_id, progress_base + 6, f"Uploading shot {index}/{total} to Google Drive")
            file_info = self.upload_resumable(local, shots_folder)
            saved = {"shot_id": shot_id, "drive_file_id": file_info["id"], "name": file_info["name"], "drive_path": f"Projects/{manifest.get('project',{}).get('name','Project')}/Episodes/{manifest.get('episode',{}).get('title','Production')}/Generated Shots"}
            completed.append(saved)
            clips.append(local)
            assets.append({"name": file_info["name"], "mime_type": "video/mp4", "file_size": int(file_info.get("size", local.stat().st_size)), "drive_file_id": file_info["id"], "drive_path": saved["drive_path"], "source_type": "generated", "metadata": {"shot_id": shot_id, "model_id": model_id}})
            self.update_progress(job_id, (index / total) * 85, f"Saved shot {index}/{total}", {"completed_shots": completed})
        self.update_progress(job_id, 90, "Assembling the episode master")
        master = work_dir / "nellwick_master.mp4"
        self.assemble(clips, master)
        master_info = self.upload_resumable(master, project_folder)
        assets.append({"name": master_info["name"], "mime_type": "video/mp4", "file_size": int(master_info.get("size", master.stat().st_size)), "drive_file_id": master_info["id"], "drive_path": f"Projects/{manifest.get('project',{}).get('name','Project')}/Episodes/{manifest.get('episode',{}).get('title','Production')}", "source_type": "rendered", "metadata": {"render": "ffmpeg-concat", "shot_count": len(shots)}})
        self.update_progress(job_id, 97, "Registering generated media and completing job")
        self.api("POST", "/api/worker/complete", json={"job_id": job_id, "assets": assets, "result": {"completed_shots": completed, "master_drive_file_id": master_info["id"], "rendered_with": "FFmpeg concat demuxer", "model_id": WAN_MODEL_ID}})
        print("Job completed. Master file:", master_info.get("name"), "Drive ID:", master_info.get("id"))

    def start_heartbeat(self, job_id: str):
        stop_event = threading.Event()
        def ping_loop():
            while not stop_event.wait(120):
                try:
                    self.api("POST", "/api/worker/heartbeat", json={"job_id": job_id})
                except Exception as exc:
                    print("Heartbeat warning:", exc)
        thread = threading.Thread(target=ping_loop, daemon=True)
        thread.start()
        return stop_event, thread

    def run(self):
        self.preflight()
        self.get_drive_credentials()
        processed = 0
        while processed < self.max_jobs:
            data = self.api("POST", "/api/worker/claim", json={"worker_label": self.label})
            job = data.get("job")
            if not job:
                print("No queued jobs. Worker session is idle; you can stop the notebook.")
                break
            print("Claimed job:", job.get("title"), job.get("id"))
            stop_heartbeat, heartbeat_thread = self.start_heartbeat(job["id"])
            try:
                self.process_job(job)
            except Exception as exc:
                details = f"{type(exc).__name__}: {exc}"
                print(details)
                traceback.print_exc()
                try: self.api("POST", "/api/worker/fail", json={"job_id": job["id"], "error": details[:1900]})
                except Exception as report_error: print("Could not report job failure:", report_error)
            finally:
                stop_heartbeat.set()
                heartbeat_thread.join(timeout=3)
            processed += 1
        print(f"Worker session finished. Jobs claimed: {processed}. You may run the notebook again to resume the queue.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--studio-url", default=os.getenv("NELLWICK_STUDIO_URL"))
    parser.add_argument("--token", default=os.getenv("NELLWICK_WORKER_TOKEN"))
    parser.add_argument("--label", default=os.getenv("NELLWICK_WORKER_LABEL", "notebook-worker"))
    parser.add_argument("--max-jobs", type=int, default=int(os.getenv("NELLWICK_MAX_JOBS", "2")))
    args = parser.parse_args()
    if not args.studio_url or not args.token:
        parser.error("Set NELLWICK_STUDIO_URL and NELLWICK_WORKER_TOKEN or pass --studio-url and --token.")
    NELLWICKWorker(args.studio_url, args.token, args.label, max(1, args.max_jobs)).run()

if __name__ == "__main__": main()
