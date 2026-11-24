"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Plus, RefreshCw, Save, Trash2, Video } from "lucide-react";
import { PageHeading } from "@/components/ui";

type Project = { id: string; name: string };
type Episode = { id: string; title: string; production_manifest: Record<string, unknown> | null };
type Asset = { id: string; name: string; mime_type: string | null; drive_file_id: string | null; file_size?: number | null };
type ShortPlan = { id: string; asset_id: string; title: string; start_seconds: number; duration_seconds: number; aspect_ratio: "9:16" };
type ShortBlueprint = {
  id: string;
  title: string;
  hook: string;
  concept: string;
  duration_seconds: number;
  characters: string[];
  location_name: string;
  product_used: string | null;
  script_markdown: string;
  voiceover: string;
  caption: string;
  thumbnail_text: string;
  cta: string;
  scenes: {
    scene_number: number;
    duration_seconds: number;
    visual_description: string;
    shot_prompt: string;
    sound_design: string;
    dialogue: { speaker: string; text: string }[];
  }[];
};
function readPlans(value: unknown): ShortPlan[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const plans = (value as Record<string, unknown>).shorts;
  return Array.isArray(plans) ? plans.filter((item): item is ShortPlan =>
    !!item && typeof item === "object" && typeof (item as ShortPlan).asset_id === "string"
  ) : [];
}

function readBlueprints(value: unknown): ShortBlueprint[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as Record<string, unknown>).short_blueprints;
  return Array.isArray(items) ? items.filter((item): item is ShortBlueprint =>
    !!item && typeof item === "object" &&
    typeof (item as ShortBlueprint).id === "string" &&
    typeof (item as ShortBlueprint).title === "string" &&
    typeof (item as ShortBlueprint).script_markdown === "string"
  ) : [];
}

export default function ShortsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("New vertical Short");
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(45);
  const [shortsPrompt, setShortsPrompt] = useState("");
  const [productFocus, setProductFocus] = useState<"natural" | "grooming_brush" | "hair_glove" | "none">("natural");
  const [blueprints, setBlueprints] = useState<ShortBlueprint[]>([]);
  const [planningJobId, setPlanningJobId] = useState("");
  const [planningStatus, setPlanningStatus] = useState("");
  const [planningProgress, setPlanningProgress] = useState(0);
  const [plans, setPlans] = useState<ShortPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [renderJobId, setRenderJobId] = useState("");
  const [renderStatus, setRenderStatus] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const episode = episodes.find((item) => item.id === episodeId);
  const videos = useMemo(() => assets.filter((item) => item.mime_type?.startsWith("video/")), [assets]);

  const loadAssets = useCallback(async (id: string) => {
    if (!id) { setAssets([]); return; }
    const response = await fetch("/api/assets?projectId=" + encodeURIComponent(id), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load project videos.");
    setAssets(data.assets || []);
  }, []);

  const loadEpisodes = useCallback(async (id: string) => {
    if (!id) { setEpisodes([]); setEpisodeId(""); return; }
    const response = await fetch("/api/projects/" + id, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load episodes.");
    setEpisodes(data.episodes || []);
    setEpisodeId((current) => data.episodes?.some((item: Episode) => item.id === current) ? current : data.episodes?.[0]?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load projects.");
        if (active) { setProjects(data.projects || []); setProjectId(data.projects?.[0]?.id || ""); }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load Shorts workspace."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadEpisodes(projectId), loadAssets(projectId)])
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load project media."); });
    return () => { active = false; };
  }, [projectId, loadEpisodes, loadAssets]);

  useEffect(() => {
    setPlans(readPlans(episode?.production_manifest));
    setBlueprints(readBlueprints(episode?.production_manifest));
  }, [episodeId, episode?.id, episode?.production_manifest]);

  useEffect(() => {
    if (!planningJobId) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check Shorts planning status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === planningJobId);
        if (!active || !job) return;
        setPlanningStatus(job.status);
        setPlanningProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setPlanningJobId("");
          await loadEpisodes(projectId);
          setNotice("Three original NELLWICK Shorts have been saved to this episode's script library.");
        } else if (job.status === "failed" || job.status === "cancelled") {
          setPlanningJobId("");
          setError(job.last_error || "Shorts planning did not complete. Check Production.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check Shorts planning status.");
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [planningJobId, projectId, loadEpisodes]);

  useEffect(() => {
    if (!renderJobId) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check Short render status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === renderJobId);
        if (!active || !job) return;
        setRenderStatus(job.status);
        setRenderProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setRenderJobId("");
          setNotice("Vertical Short rendered and saved to the project's Media Library.");
          await loadAssets(projectId);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setRenderJobId("");
          setError(job.last_error || "Short render did not complete. Check Production.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check Short render.");
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [renderJobId, projectId, loadAssets]);

  async function generateThreeShorts() {
    if (!projectId || !episodeId) { setError("Choose a project and episode first."); return; }
    if (shortsPrompt.trim().length < 20) { setError("Describe the Shorts you want in at least 20 characters."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/director/plan-shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeId, prompt: shortsPrompt.trim(), productFocus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue the Shorts planner.");
      setPlanningJobId(data.job.id);
      setPlanningStatus("queued");
      setPlanningProgress(0);
      setNotice("Three Shorts are queued for the local Qwen showrunner. Keep your Kaggle worker running.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue the Shorts planner.");
    } finally { setBusy(false); }
  }

  async function copyShortScript(short: ShortBlueprint) {
    try {
      await navigator.clipboard.writeText(short.script_markdown);
      setNotice("Copied the script for " + short.title + ".");
    } catch {
      setError("Clipboard access was unavailable. Select and copy the script from the blueprint card.");
    }
  }

  async function copyShortPrompts(short: ShortBlueprint) {
    const promptText = short.scenes.map((scene) => "SCENE " + scene.scene_number + " (" + scene.duration_seconds + "s)\n" + scene.shot_prompt).join("\n\n");
    try {
      await navigator.clipboard.writeText(promptText);
      setNotice("Copied all vertical scene prompts for " + short.title + ".");
    } catch {
      setError("Clipboard access was unavailable. Select and copy the scene prompts from the blueprint card.");
    }
  }

  function addPlan() {
    if (!assetId) { setError("Choose a source video first."); return; }
    const asset = videos.find((item) => item.id === assetId);
    if (!asset) return;
    setPlans((current) => [...current, {
      id: crypto.randomUUID(), asset_id: asset.id, title: title.trim() || asset.name,
      start_seconds: Math.max(0, start), duration_seconds: Math.max(1, Math.min(180, duration)), aspect_ratio: "9:16",
    }]);
    setNotice("Short edit plan added. Save it before rendering.");
    setError("");
  }

  async function savePlans() {
    if (!episodeId || !episode) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const existing = episode.production_manifest || {};
      const manifest = { ...existing, shorts: plans, shorts_updated_at: new Date().toISOString() };
      const response = await fetch("/api/episodes/" + episodeId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_manifest: manifest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save Shorts plan.");
      setEpisodes((current) => current.map((item) => item.id === episodeId ? data.episode : item));
      setNotice("Shorts plan saved to this episode.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Shorts plan.");
      return false;
    } finally { setBusy(false); }
  }

  async function queueShort(plan: ShortPlan) {
    if (!episodeId) return;
    const saved = await savePlans();
    if (!saved) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/jobs/render-short", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, shortId: plan.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue Short rendering.");
      setRenderJobId(data.job.id); setRenderStatus("queued"); setRenderProgress(0);
      setNotice("Short queued. The Kaggle worker will trim, center-crop and encode a 9:16 MP4 while retaining the source video&apos;s audio.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue Short rendering.");
    } finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <PageHeading eyebrow="VERTICAL CONTENT" title="Shorts studio" subtitle="Save source ranges, then render real 9:16 MP4 Shorts through the production queue." action={<button className="secondary-btn" onClick={() => void loadAssets(projectId)} disabled={!projectId}><RefreshCw size={14}/>Refresh media</button>}/>
    {error && <div className="notice" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field-label">Project<select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Episode<select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}><option value="">Select episode</option>{episodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </div>
      {!projects.length && <p className="muted">Create a project first. <Link className="text-link" href="/projects">Open projects</Link></p>}
    </section>
    {episodeId && <div className="content-grid" style={{ alignItems: "start" }}>
      <section className="panel">
        <div className="panel-title">Create a vertical cut</div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field-label">Source video<select className="field" value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">Select video</option>{videos.map((video) => <option key={video.id} value={video.id}>{video.name}</option>)}</select></label>
          <label className="field-label">Short title<input className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160}/></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="field-label">Start seconds<input className="field" type="number" min="0" step="0.1" value={start} onChange={(event) => setStart(Number(event.target.value))}/></label>
            <label className="field-label">Duration seconds<input className="field" type="number" min="1" max="180" value={duration} onChange={(event) => setDuration(Number(event.target.value))}/></label>
          </div>
          <button className="primary-btn" onClick={addPlan} disabled={!videos.length}><Plus size={14}/>Add Short plan</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><div className="panel-title">Saved vertical cuts</div><div className="panel-subtitle">{plans.length} plans · 9:16 · render up to 180 seconds</div></div><button className="primary-btn" onClick={() => void savePlans()} disabled={busy}><Save size={14}/>{busy ? "Saving…" : "Save plans"}</button></div>
        {plans.length ? <div className="project-list">{plans.map((plan) => <div className="project-row" key={plan.id}>
          <div className="project-thumb"><Video size={20}/></div>
          <div className="project-info"><strong>{plan.title}</strong><span>Start {plan.start_seconds}s · {plan.duration_seconds}s · 9:16</span></div>
          <button className="primary-btn" onClick={() => void queueShort(plan)} disabled={busy || !!renderJobId}><Clapperboard size={13}/>Render</button>
          <button className="danger-btn" onClick={() => setPlans((current) => current.filter((item) => item.id !== plan.id))}><Trash2 size={13}/></button>
        </div>)}</div> : <div className="empty-card"><div className="empty-title">No Short plans</div><p className="empty-copy">Choose a source video and add the first vertical cut.</p></div>}
        {renderJobId && <div className="panel" style={{ marginTop: 12 }}><div className="panel-title">Rendering Short · {renderStatus} · {renderProgress}%</div><div style={{ height: 7, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 10 }}><div style={{ width: renderProgress + "%", height: "100%", background: "var(--accent)" }}/></div></div>}
      </section>
    </div>}
    <div className="notice" style={{ marginTop: 16 }}>The current Short renderer uses a centered 9:16 crop and retains the source video&apos;s audio. Face-aware auto-reframing, subtitle styling, music beds and automatic hook selection remain future improvements.</div>
    <Link className="text-link" href="/production">Open production queue</Link>
  </div>;
}
