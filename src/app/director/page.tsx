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
    <PageHeading eyebrow="STORY DEVELOPMENT" title="AI Film Director" subtitle="Develop a synopsis and screenplay, then turn screenplay headings into editable scene records. This first release uses deterministic tools; AI model writing is not connected yet." />
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
