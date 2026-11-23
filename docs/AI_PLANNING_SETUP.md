# NELLWICK local AI planning setup

This batch adds local Qwen3 story and storyboard shot planning to the existing notebook-worker queue. It does not require a paid writing API key or Google Drive for planning-only jobs. Google Drive remains required for generated video upload and final media registration.

## 1. Publish the application update

Apply the accompanying PowerShell patch, run the verification/push script, and wait for the Vercel deployment for the new `main` commit to show **Ready**.

## 2. Apply the additive Supabase migration

Open the Supabase project already connected to NELLWICK, then open SQL Editor and run the complete contents of `database/migrations/0002_ai_planning.sql` once. It adds `generated_by_job_id` to `scenes` and `shots` and creates two partial indexes. It does not drop or rewrite existing data. The statements use `IF NOT EXISTS`, but this is still a migration to track as applied.

Do not rerun the original `0001_initial_schema.sql`.

## 3. Create a worker token

Sign in to NELLWICK, open **Settings & connections**, click **Create notebook token**, and copy the token immediately. It is only displayed once. Do not paste it into source code, notebook cells or GitHub.

## 4. Run the Colab or Kaggle notebook

- Colab notebook: `workers/colab/NELLWICK_Colab_Worker.ipynb`.
- Kaggle notebook: `workers/kaggle/NELLWICK_Kaggle_Worker.ipynb`.
- Enable a GPU runtime and notebook internet access.
- Enter the Studio URL `https://nellwick-ai-film-studio.vercel.app` when prompted.
- Paste the worker token when prompted. The notebook uses a hidden password prompt and does not save the token in the notebook file.
- Set maximum jobs to `1` for the first test.

The worker checks CUDA and GPU memory, downloads Qwen on first use, claims one job, and exits after the configured number of jobs. Free GPU allocation, session lifetime, RAM and quota are controlled by Kaggle/Colab and are not guaranteed.

## 5. Test story planning

1. Open **Projects**, choose a project and create an episode if needed.
2. Open **AI Film Director** and select that project and episode.
3. Enter a premise of at least 20 characters and adjust genre, tone, audience, visual direction, language and duration.
4. Click **Generate story package**. This queues a `story_plan` job; it does not run AI inside Vercel.
5. Start the notebook. Qwen3 creates a first-draft story package, principal character profiles, scene descriptions and locations. The worker saves the results into Supabase. Existing project character profiles are supplied to the model as continuity canon and reused rather than silently redesigned.
6. Review the episode screenplay, Characters and Storyboard pages.

The initial story plan is a first draft capped at 18 scenes per job. It is not a promise of a complete feature-length screenplay in a single generation. Expand/revise scenes iteratively.

## 6. Test shot planning

1. Open **Storyboard Studio** and select the episode.
2. Choose **AI shot breakdown** on a scene.
3. Run the notebook again to process the queued `shot_plan` task.
4. Review/edit the generated 3–6 draft shot prompts. The first video adapter supports Wan 2.1 T2V 1.3B, text-to-video and 2–5 second clips.

## 7. Generate video later

Connect Google Drive from **Settings & connections** before queuing video jobs. Video generation uses Wan 2.1 T2V 1.3B, requires at least 12 GiB total GPU memory in this adapter (16 GiB preferred), uploads resumable clips to Drive, and registers metadata in Supabase. Qwen is unloaded before video inference so the two models do not compete for GPU memory.

## Troubleshooting

- `No CUDA GPU is attached`: enable GPU in the notebook runtime settings, then restart the notebook.
- `Qwen story planning requires at least 8 GiB`: use a GPU runtime with at least 8 GiB total VRAM.
- `Wan ... needs ... 12 GiB`: the current video adapter will not run on that GPU; planning may still work.
- `Invalid or expired worker token`: create a new token in Studio Settings and re-enter it at notebook runtime.
- `Planning job is no longer processing`: refresh the Production page; the job may have timed out, failed, or already completed.
- Model download/runtime errors: inspect the notebook traceback and retry after confirming GPU allocation, internet access, system RAM and compatible package installs.
