"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { MapPin, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";

type Project = { id: string; name: string };
type Character = {
  id: string; project_id: string; name: string; role: string;
  canonical_description: string; visual_traits: Record<string, string>;
  wardrobe: string[]; voice_profile: Record<string, string>; continuity_notes: string;
};
type Location = { id: string; project_id: string; name: string; description: string; continuity_notes: string };
type Tab = "characters" | "locations";

const emptyCharacter = { name: "", role: "", canonical_description: "", visual: "", wardrobe: "", voice: "", continuity_notes: "" };
const emptyLocation = { name: "", description: "", continuity_notes: "" };

export default function CharactersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tab, setTab] = useState<Tab>("characters");
  const [characterForm, setCharacterForm] = useState(emptyCharacter);
  const [locationForm, setLocationForm] = useState(emptyLocation);
  const [editingCharacter, setEditingCharacter] = useState("");
  const [editingLocation, setEditingLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRecords = useCallback(async (id: string) => {
    if (!id) { setCharacters([]); setLocations([]); return; }
    const [characterResponse, locationResponse] = await Promise.all([
      fetch(`/api/characters?projectId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/locations?projectId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);
    const [characterData, locationData] = await Promise.all([characterResponse.json(), locationResponse.json()]);
    if (!characterResponse.ok) throw new Error(characterData.error || "Could not load characters.");
    if (!locationResponse.ok) throw new Error(locationData.error || "Could not load locations.");
    setCharacters(characterData.characters || []);
    setLocations(locationData.locations || []);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load projects.");
      const list: Project[] = data.projects || [];
      setProjects(list);
      const requestedProject = new URLSearchParams(window.location.search).get("projectId") || "";
      setProjectId(list.some((item) => item.id === requestedProject) ? requestedProject : list[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load projects."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadRecords(projectId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load project assets.")); }, [projectId, loadRecords]);

  function editCharacter(item: Character) {
    setTab("characters"); setEditingCharacter(item.id);
    setCharacterForm({ name: item.name, role: item.role || "", canonical_description: item.canonical_description || "", visual: item.visual_traits?.notes || "", wardrobe: (item.wardrobe || []).join("\n"), voice: item.voice_profile?.notes || "", continuity_notes: item.continuity_notes || "" });
  }
  function editLocation(item: Location) {
    setTab("locations"); setEditingLocation(item.id);
    setLocationForm({ name: item.name, description: item.description || "", continuity_notes: item.continuity_notes || "" });
  }

  async function saveCharacter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!projectId) return;
    setBusy(true); setError(""); setNotice("");
    const payload = { project_id: projectId, name: characterForm.name, role: characterForm.role, canonical_description: characterForm.canonical_description, visual_traits: characterForm.visual.trim() ? { notes: characterForm.visual.trim() } : {}, wardrobe: characterForm.wardrobe.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), voice_profile: characterForm.voice.trim() ? { notes: characterForm.voice.trim() } : {}, continuity_notes: characterForm.continuity_notes };
    try {
      const response = await fetch(editingCharacter ? `/api/characters/${editingCharacter}` : "/api/characters", { method: editingCharacter ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save character.");
      setCharacterForm(emptyCharacter); setEditingCharacter(""); await loadRecords(projectId); setNotice("Character saved to this project.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save character."); }
    finally { setBusy(false); }
  }

  async function saveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!projectId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editingLocation ? `/api/locations/${editingLocation}` : "/api/locations", { method: editingLocation ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId, ...locationForm }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save location.");
      setLocationForm(emptyLocation); setEditingLocation(""); await loadRecords(projectId); setNotice("Location saved to this project.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save location."); }
    finally { setBusy(false); }
  }

  async function removeItem(kind: Tab, id: string) {
    if (!window.confirm(`Delete this ${kind === "characters" ? "character" : "location"}? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/${kind}/${id}`, { method: "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Delete failed.");
      await loadRecords(projectId); setNotice(`${kind === "characters" ? "Character" : "Location"} deleted.`);
      if (editingCharacter === id) { setEditingCharacter(""); setCharacterForm(emptyCharacter); }
      if (editingLocation === id) { setEditingLocation(""); setLocationForm(emptyLocation); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <PageHeading eyebrow="PROJECT BIBLE" title="Characters & worlds" subtitle="Save reusable character identities, wardrobe notes, voice references, locations and continuity details." action={<button className="secondary-btn" onClick={() => void loadRecords(projectId)} disabled={!projectId}><RefreshCw size={14}/>Refresh</button>} />
    {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
    <div className="panel" style={{ marginBottom: 16 }}>
      <label className="field-label">Project workspace<select className="field" value={projectId} onChange={(event) => { setProjectId(event.target.value); setEditingCharacter(""); setEditingLocation(""); setCharacterForm(emptyCharacter); setLocationForm(emptyLocation); }}><option value="">Select a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      {!projects.length && !loading && <p className="muted" style={{ marginTop: 10 }}>Create a project before adding characters or locations. <Link className="text-link" href="/projects">Open projects</Link></p>}
    </div>
    <div className="toolbar"><button className={tab === "characters" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("characters")}><Users size={14}/>Characters ({characters.length})</button><button className={tab === "locations" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("locations")}><MapPin size={14}/>Locations ({locations.length})</button></div>
    {tab === "characters" ? <div className="content-grid" style={{ alignItems: "start" }}>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">{editingCharacter ? "Edit character" : "Create a character"}</div><div className="panel-subtitle">Keep appearance and performance notes consistent across scenes.</div></div></div>
        <form className="form-grid" onSubmit={saveCharacter}>
          <label className="field-label">Character name<input className="field" value={characterForm.name} onChange={(e) => setCharacterForm((v) => ({ ...v, name: e.target.value }))} maxLength={120} required /></label>
          <label className="field-label">Role<input className="field" value={characterForm.role} onChange={(e) => setCharacterForm((v) => ({ ...v, role: e.target.value }))} placeholder="Protagonist, supporting character…" /></label>
          <label className="field-label">Canonical appearance<textarea className="field" rows={4} value={characterForm.canonical_description} onChange={(e) => setCharacterForm((v) => ({ ...v, canonical_description: e.target.value }))} placeholder="Describe face, build, hair, age range, identifying features…" /></label>
          <label className="field-label">Visual traits<textarea className="field" rows={2} value={characterForm.visual} onChange={(e) => setCharacterForm((v) => ({ ...v, visual: e.target.value }))} placeholder="Colour palette, distinguishing details, visual references…" /></label>
          <label className="field-label">Wardrobe · one outfit per line<textarea className="field" rows={3} value={characterForm.wardrobe} onChange={(e) => setCharacterForm((v) => ({ ...v, wardrobe: e.target.value }))} placeholder="Default outfit…" /></label>
          <label className="field-label">Voice profile<textarea className="field" rows={2} value={characterForm.voice} onChange={(e) => setCharacterForm((v) => ({ ...v, voice: e.target.value }))} placeholder="Voice tone, pace, accent notes…" /></label>
          <label className="field-label">Continuity notes<textarea className="field" rows={2} value={characterForm.continuity_notes} onChange={(e) => setCharacterForm((v) => ({ ...v, continuity_notes: e.target.value }))} /></label>
          <div style={{ display: "flex", gap: 8 }}><button className="primary-btn" disabled={busy || !projectId}><Save size={14}/>{busy ? "Saving…" : editingCharacter ? "Save changes" : "Create character"}</button>{editingCharacter && <button type="button" className="secondary-btn" onClick={() => { setEditingCharacter(""); setCharacterForm(emptyCharacter); }}>Cancel edit</button>}</div>
        </form>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">Saved characters</div><div className="panel-subtitle">Records are scoped to the selected project.</div></div></div>
        {characters.length ? <div className="project-list">{characters.map((item) => <div className="project-row" key={item.id}><div className="project-thumb"><Users size={20}/></div><div className="project-info"><strong>{item.name}</strong><span>{item.role || "Character"} · {(item.wardrobe || []).length} wardrobe notes</span></div><button className="secondary-btn" onClick={() => editCharacter(item)}>Edit</button><button className="danger-btn" disabled={busy} onClick={() => void removeItem("characters", item.id)}><Trash2 size={13}/></button></div>)}</div> : <div className="empty-card"><div className="empty-title">No characters yet</div><p className="empty-copy">Create the first character profile for this project.</p></div>}
      </section>
    </div> : <div className="content-grid" style={{ alignItems: "start" }}>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">{editingLocation ? "Edit location" : "Create a location"}</div><div className="panel-subtitle">Store reusable environment descriptions.</div></div></div>
        <form className="form-grid" onSubmit={saveLocation}>
          <label className="field-label">Location name<input className="field" value={locationForm.name} onChange={(e) => setLocationForm((v) => ({ ...v, name: e.target.value }))} required maxLength={120} /></label>
          <label className="field-label">Visual description<textarea className="field" rows={5} value={locationForm.description} onChange={(e) => setLocationForm((v) => ({ ...v, description: e.target.value }))} placeholder="Architecture, time of day, lighting, textures, atmosphere…" /></label>
          <label className="field-label">Continuity notes<textarea className="field" rows={3} value={locationForm.continuity_notes} onChange={(e) => setLocationForm((v) => ({ ...v, continuity_notes: e.target.value }))} /></label>
          <div style={{ display: "flex", gap: 8 }}><button className="primary-btn" disabled={busy || !projectId}><Save size={14}/>{busy ? "Saving…" : editingLocation ? "Save changes" : "Create location"}</button>{editingLocation && <button type="button" className="secondary-btn" onClick={() => { setEditingLocation(""); setLocationForm(emptyLocation); }}>Cancel edit</button>}</div>
        </form>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">Saved locations</div><div className="panel-subtitle">Use these locations when planning scenes.</div></div></div>
        {locations.length ? <div className="project-list">{locations.map((item) => <div className="project-row" key={item.id}><div className="project-thumb"><MapPin size={20}/></div><div className="project-info"><strong>{item.name}</strong><span>{item.description || "No description added"}</span></div><button className="secondary-btn" onClick={() => editLocation(item)}>Edit</button><button className="danger-btn" disabled={busy} onClick={() => void removeItem("locations", item.id)}><Trash2 size={13}/></button></div>)}</div> : <div className="empty-card"><div className="empty-title">No locations yet</div><p className="empty-copy">Create the first environment for this project.</p></div>}
      </section>
    </div>}
  </div>;
}
