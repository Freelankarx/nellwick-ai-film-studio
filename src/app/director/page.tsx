"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, ListPlus, Save, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui";

type Project = { id: string; name: string };
type Episode = { id: string; title: string; synopsis: string; script_markdown: string; status: string; aspect_ratio: string };

function parseSceneHeadings(script: string) {
  const lines = script.split(/\r?\n/);
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^(?:#{1,3}\s*)?(?:scene\s+\d+\b|int\.|ext\.|int\/ext\.)/i.test(line)) starts.push(index);
  }
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const title = lines[start].trim().replace(/^#{1,3}\s*/, "");
    const block = lines.slice(start + 1, end).join("\n").trim();
    return { title: title.slice(0, 200), summary: block.slice(0, 10000), script_excerpt: [lines[start], block].filter(Boolean).join("\n\n").slice(0, 20000) };
  });
}

export default function DirectorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [script, setScript] = useState("");
  const [status, setStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [premise, setPremise] = useState("");
  const [tone, setTone] = useState("Emotionally engaging, cinematic and grounded");
  const [audience, setAudience] = useState("General audience");
  const [visualStyle, setVisualStyle] = useState("Cinematic realism, natural skin texture, motivated lighting");
  const [targetMinutes, setTargetMinutes] = useState(8);
  const [language, setLanguage] = useState("English");
  const [planningJobId, setPlanningJobId] = useState("");
  const [planningStatus, setPlanningStatus] = useState("");
  const [planningProgress, setPlanningProgress] = useState(0);
  const sceneDrafts = useMemo(() => parseSceneHeadings(script), [script]);

  const loadEpisodes = useCallback(async (id: string) => {
    if (!id) { setEpisodes([]); setEpisodeId(""); return; }
    const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load episodes.");
    const list: Episode[] = data.episodes || [];
    const requestedEpisode = new URLSearchParams(window.location.search).get("episodeId") || "";
    setEpisodes(list);
    setEpisodeId(list.some((episode) => episode.id === requestedEpisode) ? requestedEpisode : list[0]?.id || "");
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
        const requestedProject = new URLSearchParams(window.location.search).get("projectId") || "";
        setProjects(list);
        setProjectId(list.some((item) => item.id === requestedProject) ? requestedProject : list[0]?.id || "");
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Could not load projects."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { void loadEpisodes(projectId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load episodes.")); }, [projectId, loadEpisodes]);
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
        if (!response.ok) throw new Error(data.error || "Could not check AI planning status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === planningJobId);
        if (!active || !job) return;
        setPlanningStatus(job.status);
        setPlanningProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setPlanningJobId("");
          setNotice("AI story package saved. Review the screenplay and generated scenes below.");
          const refresh = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
          const refreshed = await refresh.json();
          if (active && refresh.ok) setEpisodes(refreshed.episodes || []);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setPlanningJobId("");
          setError(job.last_error || "AI story planning did not complete. Open Production to review the job and retry it.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check AI planning status.");
      } finally {
        checking = false;
      }
    };
    void checkJob();
    const timer = window.setInterval(() => void checkJob(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [planningJobId, projectId]);

  useEffect(() => {
    const episode = episodes.find((item) => item.id === episodeId);
    setSynopsis(episode?.synopsis || "");
    setScript(episode?.script_markdown || "");
    setStatus(episode?.status || "draft");
    setLastSaved("");
  }, [episodeId, episodes]);

  async function saveEpisode() {
    if (!episodeId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/episodes/${episodeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ synopsis, script_markdown: script, status: status === "draft" ? "planning" : status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save screenplay.");
      setEpisodes((current) => current.map((item) => item.id === episodeId ? data.episode : item));
      setLastSaved(new Date().toLocaleTimeString()); setNotice("Screenplay and episode notes saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save screenplay."); }
    finally { setBusy(false); }
  }

  async function queueAiStoryPlan() {
    if (!projectId || !episodeId) return;
    if (premise.trim().length < 20) {
      setError("Give the planner a story premise of at least 20 characters.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          episode_id: episodeId,
          premise,
          genre,
          tone,
          audience,
          visual_style: visualStyle,
          target_duration_minutes: targetMinutes,
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue AI story planning.");
      setPlanningJobId(data.job.id);
      setPlanningStatus("queued");
      setPlanningProgress(0);
      setNotice("AI story plan queued. Start the Kaggle or Colab worker from its notebook; the planner runs locally on that GPU.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue AI story planning.");
    } finally {
      setBusy(false);
    }
  }

  async function buildScenes() {
    if (!episodeId || !sceneDrafts.length) return;
    if (!window.confirm(`Create ${sceneDrafts.length} scenes from the screenplay headings? Existing scenes will not be deleted.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      for (const item of sceneDrafts) {
        const response = await fetch("/api/scenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episode_id: episodeId, ...item }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not create a scene from the screenplay heading.");
      }
      setNotice(`${sceneDrafts.length} scenes created from your screenplay. Open Storyboard Studio to add shots.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create scenes."); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <PageHeading eyebrow="STORY DEVELOPMENT" title="AI Film Director" subtitle="Build a story package with a local GPU language model, save the screenplay and create editable scene records. The notebook worker runs only while you start it." />
    {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field-label">Project<select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Episode<select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}><option value="">Select episode</option>{episodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </div>
      {!loading && !projects.length && <p className="muted" style={{ marginTop: 12 }}>Create a project before writing a screenplay. <Link className="text-link" href="/projects">Open projects</Link></p>}
      {!!projectId && !episodes.length && <p className="muted" style={{ marginTop: 12 }}>This project has no episodes yet. Open its workspace to create one.</p>}
    </div>
    {episodeId && <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-heading"><div><div className="panel-title"><Sparkles size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}/>Local AI story planner</div><div className="panel-subtitle">Qwen3 runs in your Kaggle or Colab notebook. No paid writing API key is required.</div></div><span className="pill">GPU worker</span></div>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field-label">Story premise<textarea className="field" rows={4} value={premise} onChange={(event) => setPremise(event.target.value)} maxLength={2500} placeholder="Describe the central idea, protagonist, conflict and what makes this story worth watching…" /></label>
        <label className="field-label">Visual direction<textarea className="field" rows={4} value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)} maxLength={300} placeholder="Visual look, lighting, camera language and production mood…" /></label>
        <label className="field-label">Genre<input className="field" value={genre} onChange={(event) => setGenre(event.target.value)} maxLength={80}/></label>
        <label className="field-label">Tone<input className="field" value={tone} onChange={(event) => setTone(event.target.value)} maxLength={160}/></label>
        <label className="field-label">Audience<input className="field" value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={200}/></label>
        <label className="field-label">Language<input className="field" value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={60}/></label>
        <label className="field-label">Target episode duration (minutes)<input className="field" type="number" min="1" max="120" value={targetMinutes} onChange={(event) => setTargetMinutes(Math.min(120, Math.max(1, Number(event.target.value) || 1)))}/></label>
        <div className="field-label" style={{ justifyContent: "end" }}><button className="primary-btn" onClick={() => void queueAiStoryPlan()} disabled={busy || !!planningJobId || premise.trim().length < 20}><Sparkles size={14}/>{planningJobId ? "AI planning in progress…" : busy ? "Queueing…" : "Generate story package"}</button></div>
      </div>
      {planningJobId && <div className="notice" style={{ marginTop: 12 }}><strong>AI planning {planningStatus || "queued"}</strong><div style={{ height: 6, background: "rgba(255,255,255,.12)", borderRadius: 999, marginTop: 9, overflow: "hidden" }}><div style={{ height: "100%", width: `${planningProgress}%`, background: "var(--accent, #7c9cff)", transition: "width .3s ease" }}/></div><span className="muted" style={{ fontSize: 11 }}>{planningProgress}% · Keep the notebook running until the job completes. <Link className="text-link" href="/production">View production queue</Link></span></div>}
      <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>The planner creates a first-draft story package and scene breakdown. Longer episodes can be developed scene by scene; this is not a promise of a complete feature-length screenplay in one model response. Start a worker token in Settings and run the NELLWICK notebook to process the job.</p>
    </section>}
    {episodeId ? <div className="content-grid" style={{ alignItems: "start" }}>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title"><BookOpen size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}/>Story brief</div><div className="panel-subtitle">The synopsis belongs to the selected episode.</div></div></div>
        <div className="form-grid">
          <label className="field-label">Synopsis<textarea className="field" rows={7} value={synopsis} onChange={(event) => setSynopsis(event.target.value)} maxLength={10000} placeholder="What happens in this episode? What does the audience need to feel or understand?" /></label>
          <label className="field-label">Episode status<select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Draft</option><option value="planning">Planning</option><option value="approved">Approved</option><option value="archived">Archived</option></select></label>
          <button className="primary-btn" onClick={() => void saveEpisode()} disabled={busy}><Save size={14}/>{busy ? "Saving…" : "Save story brief"}</button>
          {lastSaved && <span className="muted" style={{ fontSize: 10 }}>Saved at {lastSaved}</span>}
        </div>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title"><FileText size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}/>Screenplay</div><div className="panel-subtitle">Markdown is saved directly to your episode.</div></div><span className="pill">{script.length.toLocaleString()} characters</span></div>
        <div className="form-grid">
          <label className="field-label">Script / screenplay<textarea className="field" rows={20} value={script} onChange={(event) => setScript(event.target.value)} maxLength={200000} placeholder={'# Scene 1: INT. APARTMENT - NIGHT\n\nDescribe the scene…\n\n# Scene 2: EXT. STREET - DAWN\n\nDescribe the next scene…'} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.6 }} /></label>
          <div className="notice">Scene headings detected: <b>{sceneDrafts.length}</b>. Use headings such as <code># Scene 1: INT. APARTMENT - NIGHT</code>, <code>INT. HOUSE - DAY</code> or <code>EXT. STREET - NIGHT</code>.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="primary-btn" onClick={() => void saveEpisode()} disabled={busy}><Save size={14}/>Save screenplay</button><button className="secondary-btn" onClick={() => void buildScenes()} disabled={busy || !sceneDrafts.length}><ListPlus size={14}/>Create {sceneDrafts.length} scenes</button><Link className="secondary-btn" href={`/storyboards?projectId=${projectId}&episodeId=${episodeId}`}><Sparkles size={14}/>Open storyboard</Link></div>
          <p className="muted" style={{ fontSize: 10 }}>The scene builder creates database records from matching headings. It does not generate prose with an AI model or overwrite existing scenes.</p>
        </div>
      </section>
    </div> : <div className="panel muted">Select a project and episode to open the director workspace.</div>}
  </div>;
}
