"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Plus, RefreshCw, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/ui";

type StoryboardShot = { id: string; status: string; prompt: string; model_id: string; generation_mode: string; duration_seconds: number };

type Project = { id: string; name: string };
type Episode = { id: string; title: string; aspect_ratio: string };
type Shot = { id: string; scene_id: string; shot_number: number; prompt: string; negative_prompt: string; action_description: string; duration_seconds: number; aspect_ratio: string; model_id: string; generation_mode: string; status: string };
type Scene = { id: string; episode_id: string; scene_number: number; title: string; summary: string; continuity_notes: string; location_id: string | null; shots: Shot[] };

export default function StoryboardsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneTitle, setSceneTitle] = useState("");
  const [sceneSummary, setSceneSummary] = useState("");
  const [selectedShots, setSelectedShots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planningJobId, setPlanningJobId] = useState("");
  const [planningSceneId, setPlanningSceneId] = useState("");

  const loadScenes = useCallback(async (id: string) => {
    if (!id) { setScenes([]); setSelectedShots([]); return; }
    const response = await fetch(`/api/scenes?episodeId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load scenes.");
    const sceneRows: Scene[] = data.scenes || [];
    const loaded = await Promise.all(sceneRows.map(async (scene) => {
      const shotResponse = await fetch(`/api/scenes/${scene.id}/shots`, { cache: "no-store" });
      const shotData = await shotResponse.json();
      if (!shotResponse.ok) throw new Error(shotData.error || `Could not load shots for ${scene.title || `Scene ${scene.scene_number}`}.`);
      return { ...scene, shots: shotData.shots || [] };
    }));
    setScenes(loaded);
    setSelectedShots(loaded.flatMap((scene) => (scene.shots as StoryboardShot[]).filter((shot) => shot.status === "draft" && shot.prompt.trim().length >= 10 && shot.model_id === "wan21-t2v-1.3b" && shot.generation_mode === "text_to_video" && shot.duration_seconds >= 2 && shot.duration_seconds <= 5).map((shot) => shot.id)));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load projects.");
        if (!active) return;
        const list: Project[] = data.projects || [];
        const params = new URLSearchParams(window.location.search);
        const requestedProject = params.get("projectId") || "";
        setProjects(list);
        setProjectId(list.some((project) => project.id === requestedProject) ? requestedProject : list[0]?.id || "");
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Could not load projects."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!projectId) { setEpisodes([]); setEpisodeId(""); return; }
    (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load episodes.");
        if (!active) return;
        const list: Episode[] = data.episodes || [];
        const requested = new URLSearchParams(window.location.search).get("episodeId") || "";
        setEpisodes(list);
        setEpisodeId(list.some((episode) => episode.id === requested) ? requested : list[0]?.id || "");
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Could not load episodes."); }
    })();
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => { void loadScenes(episodeId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load storyboard.")); }, [episodeId, loadScenes]);
  useEffect(() => {
    if (!planningJobId) return;
    let active = true;
    let checking = false;
    const checkJob = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check shot-planning status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === planningJobId);
        if (!active || !job) return;
        if (job.status === "completed") {
          setPlanningJobId(""); setPlanningSceneId("");
          await loadScenes(episodeId);
          setNotice("AI shot breakdown saved. Review and edit the prompts before queuing video generation.");
        } else if (job.status === "failed" || job.status === "cancelled") {
          setPlanningJobId(""); setPlanningSceneId("");
          setError(job.last_error || "AI shot planning failed. Open Production to retry the job.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check shot-planning status.");
      } finally { checking = false; }
    };
    void checkJob();
    const timer = window.setInterval(() => void checkJob(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [planningJobId, episodeId, loadScenes]);
  const allShots = useMemo(() => scenes.flatMap((scene) => scene.shots), [scenes]);
  const queueableShots = allShots.filter((shot) => shot.prompt.trim().length >= 10 && shot.status !== "queued" && shot.status !== "processing" && shot.model_id === "wan21-t2v-1.3b" && shot.generation_mode === "text_to_video" && shot.duration_seconds >= 2 && shot.duration_seconds <= 5);

  async function createScene(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!episodeId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/scenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episode_id: episodeId, title: sceneTitle, summary: sceneSummary }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create scene.");
      setSceneTitle(""); setSceneSummary(""); await loadScenes(episodeId); setNotice("Scene created.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create scene."); }
    finally { setBusy(false); }
  }

  async function generateShotPlan(scene: Scene) {
    setBusy(true); setError(""); setNotice("");
    try {
      const additionalNotes = window.prompt("Optional shot-planning notes (for example: keep the character's coat and hairstyle identical, use restrained camera movement):", "") || "";
      const response = await fetch("/api/director/plan-shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id, additional_notes: additionalNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue AI shot planning.");
      setPlanningJobId(data.job.id);
      setPlanningSceneId(scene.id);
      setNotice("AI shot breakdown queued. Keep your Kaggle or Colab notebook running until the job completes.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue AI shot planning.");
    } finally { setBusy(false); }
  }

  async function createShot(scene: Scene) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/scenes/${scene.id}/shots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "", duration_seconds: 5, aspect_ratio: episodes.find((item) => item.id === episodeId)?.aspect_ratio || "16:9" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not add shot.");
      await loadScenes(episodeId); setNotice(`Shot ${data.shot.shot_number} added to ${scene.title || `Scene ${scene.scene_number}`}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add shot."); }
    finally { setBusy(false); }
  }

  async function saveShot(shot: Shot, form: HTMLFormElement) {
    const formData = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: String(formData.get("prompt") || ""), negative_prompt: String(formData.get("negative_prompt") || ""), action_description: String(formData.get("action_description") || ""), duration_seconds: Number(formData.get("duration_seconds") || 5) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save shot.");
      await loadScenes(episodeId); setNotice("Shot prompt saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save shot."); }
    finally { setBusy(false); }
  }

  async function removeShot(shot: Shot) {
    if (!window.confirm(`Delete shot ${shot.shot_number}?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/shots/${shot.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete shot.");
      await loadScenes(episodeId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete shot."); }
    finally { setBusy(false); }
  }

  async function editScene(scene: Scene) {
    const title = window.prompt("Scene title", scene.title || ""); if (title === null) return;
    const summary = window.prompt("Scene summary", scene.summary || ""); if (summary === null) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/scenes/${scene.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, summary }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update scene.");
      await loadScenes(episodeId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update scene."); }
    finally { setBusy(false); }
  }

  async function removeScene(scene: Scene) {
    if (!window.confirm(`Delete scene ${scene.scene_number} and all its shots?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/scenes/${scene.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete scene.");
      await loadScenes(episodeId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete scene."); }
    finally { setBusy(false); }
  }

  async function queueSelected() {
    if (!episodeId || !selectedShots.length) return;
    const chosen = selectedShots.filter((id) => queueableShots.some((shot) => shot.id === id));
    if (!chosen.length) return setError("Select at least one compatible shot with a complete prompt.");
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/jobs/queue-shots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, shotIds: chosen }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not queue shots.");
      await loadScenes(episodeId); setNotice(`${data.shot_count || chosen.length} shots queued for the GPU worker.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not queue shots."); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <PageHeading eyebrow="SHOT DESIGN & COVERAGE" title="Storyboard studio" subtitle="Build scenes, generate AI shot breakdowns with the local GPU planner, refine prompts and queue compatible shots for video generation." action={<button className="secondary-btn" onClick={() => void loadScenes(episodeId)} disabled={!episodeId}><RefreshCw size={14}/>Refresh</button>} />
    {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
    <div className="panel" style={{ marginBottom: 16 }}><div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <label className="field-label">Project<select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field-label">Episode<select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}><option value="">Select episode</option>{episodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </div>
    {!loading && !projects.length && <p className="muted">Create a project first. <Link className="text-link" href="/projects">Open projects</Link></p>}
    {!!projectId && !episodes.length && <p className="muted">Create an episode inside this project before building a storyboard.</p>}
    </div>
    {episodeId && <>
      <div className="panel" style={{ marginBottom: 16 }}><div className="panel-heading"><div><div className="panel-title">Add a scene</div><div className="panel-subtitle">Scenes are saved under the selected episode.</div></div></div>
        <form onSubmit={createScene} className="form-grid" style={{ gridTemplateColumns: "1fr 2fr auto", alignItems: "end" }}><label className="field-label">Scene title<input className="field" value={sceneTitle} onChange={(event) => setSceneTitle(event.target.value)} placeholder="INT. STUDIO - NIGHT" required maxLength={200}/></label><label className="field-label">Summary<textarea className="field" rows={1} value={sceneSummary} onChange={(event) => setSceneSummary(event.target.value)} placeholder="What happens in this scene?"/></label><button className="primary-btn" disabled={busy}><Plus size={14}/>Add scene</button></form>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}><div className="panel-heading"><div><div className="panel-title">Storyboard overview</div><div className="panel-subtitle">{scenes.length} scenes · {allShots.length} shots · {queueableShots.length} currently compatible with the installed video worker.</div></div><button className="primary-btn" onClick={() => void queueSelected()} disabled={busy || !selectedShots.length}><Send size={14}/>Queue selected ({selectedShots.length})</button></div>
        <div className="notice">AI shot breakdowns are drafted by Qwen3 in the notebook. Review the prompts before queuing them. The current video adapter supports Wan 2.1 T2V 1.3B, text-to-video prompts and 2–5 second clips. Image-to-video and audio generation are not enabled yet.</div>
        {planningJobId && <div className="notice" style={{ marginTop: 10 }}>AI shot planning is queued or processing for {scenes.find((scene) => scene.id === planningSceneId)?.title || "this scene"}. <Link className="text-link" href="/production">View production queue</Link></div>}
      </div>
      {scenes.length ? <div className="form-grid">{scenes.map((scene) => <section className="panel" key={scene.id}>
        <div className="panel-heading"><div><div className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</div><div className="panel-title">{scene.title || `Scene ${scene.scene_number}`}</div><div className="panel-subtitle">{scene.summary || "No scene summary yet."}</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="secondary-btn" onClick={() => void generateShotPlan(scene)} disabled={busy || !!planningJobId}><Sparkles size={13}/>AI shot breakdown</button><button className="secondary-btn" onClick={() => void editScene(scene)} disabled={busy}>Edit</button><button className="danger-btn" onClick={() => void removeScene(scene)} disabled={busy}><Trash2 size={13}/></button><button className="primary-btn" onClick={() => void createShot(scene)} disabled={busy}><Plus size={13}/>Add shot</button></div></div>
        {scene.shots.length ? <div className="form-grid">{scene.shots.map((shot) => <form key={shot.id} className="panel" style={{ background: "rgba(255,255,255,.02)" }} onSubmit={(event) => { event.preventDefault(); void saveShot(shot, event.currentTarget); }}>
          <div className="panel-heading"><div><div className="panel-title">Shot {shot.shot_number}</div><div className="panel-subtitle">{shot.status} · {shot.duration_seconds}s · {shot.model_id}</div></div><label className="field-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" checked={selectedShots.includes(shot.id)} disabled={!queueableShots.some((item) => item.id === shot.id)} onChange={(event) => setSelectedShots((current) => event.target.checked ? [...current, shot.id] : current.filter((id) => id !== shot.id))}/>Queue</label></div>
          <label className="field-label">Generation prompt<textarea name="prompt" className="field" rows={3} defaultValue={shot.prompt} placeholder="Describe framing, subject, environment, lighting, movement and visual style…" maxLength={4000}/></label>
          <label className="field-label">Action description<input name="action_description" className="field" defaultValue={shot.action_description || ""} placeholder="What happens during the shot?" maxLength={2000}/></label>
          <label className="field-label">Negative prompt<textarea name="negative_prompt" className="field" rows={2} defaultValue={shot.negative_prompt} maxLength={2000}/></label>
          <label className="field-label">Duration<select name="duration_seconds" className="field" defaultValue={shot.duration_seconds}><option value="2">2 seconds</option><option value="3">3 seconds</option><option value="4">4 seconds</option><option value="5">5 seconds</option></select></label>
          <div style={{ display: "flex", gap: 8 }}><button className="primary-btn" disabled={busy}><Save size={13}/>Save shot</button><button type="button" className="danger-btn" onClick={() => void removeShot(shot)} disabled={busy || shot.status === "queued" || shot.status === "processing"}><Trash2 size={13}/>Delete</button></div>
        </form>)}</div> : <div className="empty-card"><div className="empty-title">No shots in this scene</div><p className="empty-copy">Add a shot and write its generation prompt.</p></div>}
      </section>)}</div> : <div className="empty-card"><div className="empty-icon"><Clapperboard size={22}/></div><div className="empty-title">No scenes yet</div><p className="empty-copy">Create scenes here or use the Director&apos;s screenplay heading tool to create them from your script.</p><Link className="secondary-btn" href={`/director`}>Open AI Film Director</Link></div>}
    </>}
  </div>;
}
