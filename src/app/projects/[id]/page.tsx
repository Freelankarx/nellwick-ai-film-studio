"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Film, Plus, Save, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/ui";

type ProjectRecord = { id: string; name: string; description: string; project_type: string; aspect_ratio: string };
type EpisodeRecord = { id: string; title: string; status: string; target_duration_seconds: number | null; aspect_ratio: string };

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [episodeName, setEpisodeName] = useState("Episode 01");
  const [form, setForm] = useState({ name: "", description: "", project_type: "film", aspect_ratio: "16:9" });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProject = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load project.");
      setProject(data.project); setEpisodes(data.episodes || []);
      setForm({ name: data.project.name, description: data.project.description || "", project_type: data.project.project_type, aspect_ratio: data.project.aspect_ratio });
      setEpisodeName(`Episode ${String((data.episodes || []).length + 1).padStart(2, "0")}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load project."); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { void loadProject(); }, [loadProject]);

  async function addEpisode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/episodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: episodeName }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create episode.");
      setEpisodes((current) => [data.episode, ...current]); setEpisodeName(`Episode ${String(episodes.length + 2).padStart(2, "0")}`); setNotice("Episode created and saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create episode."); }
    finally { setBusy(false); }
  }
  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update project.");
      setProject(data.project); setEditing(false); setNotice("Project details saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update project."); }
    finally { setBusy(false); }
  }
  async function deleteProject() {
    if (!window.confirm("Delete this project and its episodes, scenes and shots? This cannot be undone.")) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not delete project."); router.replace("/projects"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete project."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="page-wrap"><div className="panel">Loading project…</div></div>;
  if (!project) return <div className="page-wrap"><Link href="/projects" className="text-link"><ArrowLeft size={13}/> Back to projects</Link><div className="panel" style={{ marginTop: 18 }}>{error || "Project not found."}</div></div>;
  return <div className="page-wrap">
    <Link href="/projects" className="text-link"><ArrowLeft size={13}/> Back to projects</Link>
    <PageHeading eyebrow={`PROJECT WORKSPACE · ${project.project_type.toUpperCase()}`} title={project.name} subtitle={project.description || "Your project bible, episodes, characters, storyboards and finished films."} action={<div style={{ display: "flex", gap: 8 }}><button className="secondary-btn" onClick={() => setEditing((value) => !value)}>{editing ? "Close edit" : "Edit project"}</button><button className="danger-btn" onClick={() => void deleteProject()} disabled={busy}><Trash2 size={13}/>Delete</button></div>} />
    {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}{notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
    {editing && <section className="panel" style={{ marginBottom: 16 }}><div className="panel-title">Project settings</div><form className="form-grid" onSubmit={saveProject} style={{ marginTop: 14 }}>
      <label className="field-label">Project name<input className="field" value={form.name} onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))} minLength={2} maxLength={120} required/></label>
      <label className="field-label">Description<textarea className="field" rows={3} value={form.description} onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))} maxLength={2000}/></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label className="field-label">Type<select className="field" value={form.project_type} onChange={(event) => setForm((v) => ({ ...v, project_type: event.target.value }))}><option value="film">Film</option><option value="series">Series</option><option value="advertisement">Advertisement</option><option value="documentary">Documentary</option><option value="social">Social</option><option value="other">Other</option></select></label><label className="field-label">Aspect ratio<select className="field" value={form.aspect_ratio} onChange={(event) => setForm((v) => ({ ...v, aspect_ratio: event.target.value }))}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option></select></label></div>
      <button className="primary-btn" disabled={busy}><Save size={14}/>Save project</button>
    </form></section>}
    <section className="panel" style={{ marginBottom: 16 }}><div className="panel-heading"><div><div className="panel-title">Episodes & productions</div><div className="panel-subtitle">Each episode has its own screenplay, scenes, shots and output media.</div></div><span className="pill purple">{project.aspect_ratio}</span></div>
      <form className="form-grid" onSubmit={addEpisode} style={{ gridTemplateColumns: "1fr auto", alignItems: "end", marginBottom: 16 }}><label className="field-label">New episode title<input className="field" value={episodeName} onChange={(event) => setEpisodeName(event.target.value)} minLength={2} maxLength={160} required/></label><button className="primary-btn" disabled={busy}><Plus size={14}/>Create episode</button></form>
      {episodes.length ? <div className="project-list">{episodes.map((episode) => <div className="project-row" key={episode.id}><div className="project-thumb"><Film size={20}/></div><div className="project-info"><strong>{episode.title}</strong><span>{episode.status} · {episode.target_duration_seconds ? `${Math.round(episode.target_duration_seconds / 60)} min target` : "Runtime not set"}</span></div><span className="pill">{episode.aspect_ratio}</span><Link className="secondary-btn" href={`/director?projectId=${projectId}&episodeId=${episode.id}`}>Script</Link><Link className="primary-btn" href={`/storyboards?projectId=${projectId}&episodeId=${episode.id}`}>Storyboard</Link></div>)}</div> : <div className="empty-card"><div className="empty-title">No episodes yet</div><p className="empty-copy">Create an episode to start writing its screenplay and planning scenes.</p></div>}
    </section>
    <div className="quick-grid"><Link className="quick-card" href={`/characters?projectId=${projectId}`}><span><b>Characters & worlds</b><small>Manage cast and locations for this project</small></span></Link><Link className="quick-card" href={`/director?projectId=${projectId}`}><span><b>AI Film Director</b><small>Write and save the screenplay</small></span></Link><Link className="quick-card" href={`/media?projectId=${projectId}`}><span><b>Project media</b><small>Manage uploaded and generated files</small></span></Link></div>
  </div>;
}
