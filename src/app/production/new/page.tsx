"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Scissors } from "lucide-react";
import { PageHeading } from "@/components/ui";

type Project = { id: string; name: string; aspect_ratio: string };
type Episode = { id: string; title: string; aspect_ratio: string };
const samplePrompt = "A cinematic wide shot of a fictional young woman walking slowly through a rain-soaked city street at blue hour, reflections on the pavement, soft practical lights, subtle camera dolly forward, realistic film lighting, atmospheric depth, natural movement.";

export default function NewProductionJobPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [title, setTitle] = useState("Test cinematic sequence");
  const [promptsText, setPromptsText] = useState(samplePrompt);
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const shotPrompts = useMemo(() => promptsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [promptsText]);
  const runtimeSeconds = shotPrompts.length * duration;

  useEffect(() => {
    fetch("/api/projects").then((response) => response.json()).then((data) => {
      setProjects(data.projects || []);
      if (data.projects?.[0]) { setProjectId(data.projects[0].id); setRatio(data.projects[0].aspect_ratio); }
    }).catch(() => setError("Could not load projects. Configure Supabase and sign in first."));
  }, []);

  useEffect(() => {
    if (!projectId) { setEpisodes([]); setEpisodeId(""); return; }
    fetch(`/api/projects/${projectId}`).then((response) => response.json()).then((data) => {
      const list = data.episodes || [];
      setEpisodes(list);
      setEpisodeId((current) => list.some((episode: Episode) => episode.id === current) ? current : "");
    }).catch(() => setEpisodes([]));
  }, [projectId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (shotPrompts.length < 1) return setError("Add at least one shot prompt.");
    if (shotPrompts.length > 120) return setError("The first worker supports up to 120 shots per queued job.");
    const invalid = shotPrompts.findIndex((prompt) => prompt.length < 10 || prompt.length > 4000);
    if (invalid >= 0) return setError(`Shot ${invalid + 1} must contain between 10 and 4,000 characters.`);
    setBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...(episodeId ? { episodeId } : {}), title, shotPrompts, duration, aspectRatio: ratio, modelId: "wan21-t2v-1.3b" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue production.");
      router.push("/production");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue production.");
    } finally {
      setBusy(false);
    }
  }

  const estimatedMinutes = runtimeSeconds / 60;
  return <div className="page-wrap">
    <Link href="/production" className="text-link"><ArrowLeft size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Back to queue</Link>
    <PageHeading eyebrow="NEW PRODUCTION JOB" title="Queue a shot sequence" subtitle="Create a multi-shot batch. Each non-empty line becomes a separate short clip, and the worker assembles completed shots in order." />
    <div className="panel" style={{ maxWidth: 860 }}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field-label">Project<select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="field-label">Episode (optional)<select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}><option value="">Save under project only</option>{episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></label>
        <label className="field-label">Production job title<input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={160} /></label>
        <label className="field-label">Shot prompts · one prompt per line<textarea className="field" rows={10} value={promptsText} onChange={(event) => setPromptsText(event.target.value)} placeholder="Describe shot 1…&#10;Describe shot 2…&#10;Describe shot 3…" required /></label>
        <div className="notice"><b>{shotPrompts.length} shots</b> · {duration} seconds each · estimated assembled runtime <b>{Math.floor(runtimeSeconds / 60)}m {runtimeSeconds % 60}s</b> ({estimatedMinutes.toFixed(1)} min). The first adapter generates each shot independently with Wan 2.1 T2V 1.3B. You can queue up to 120 shots in one job; long jobs may need multiple GPU sessions.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field-label">Clip duration<select className="field" value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={2}>2 seconds · test</option><option value={3}>3 seconds</option><option value={4}>4 seconds</option><option value={5}>5 seconds · baseline maximum</option></select></label>
          <label className="field-label">Aspect ratio<select className="field" value={ratio} onChange={(event) => setRatio(event.target.value)}><option>16:9</option><option>9:16</option></select></label>
        </div>
        <div className="notice"><Scissors size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />Baseline: Wan 2.1 T2V 1.3B only. It does not yet animate a supplied reference image, generate speech, or create character continuity. The queue saves each completed shot to Google Drive so another notebook session can reuse it after an interruption.</div>
        {error && <div className="notice">{error}</div>}
        <button className="primary-btn" disabled={busy || !projects.length}><Play size={14} />{busy ? "Queueing sequence…" : `Queue ${shotPrompts.length} shot${shotPrompts.length === 1 ? "" : "s"}`}</button>
        {!projects.length && <p className="muted" style={{ fontSize: 10 }}>Create a project before queuing a sequence.</p>}
      </form>
    </div>
  </div>;
}
