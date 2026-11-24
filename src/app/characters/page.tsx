"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  Volume2,
} from "lucide-react";
import { PageHeading } from "@/components/ui";
import { ReferenceAssetPicker } from "@/components/reference-asset-picker";

type Project = { id: string; name: string };
type Character = {
  id: string;
  project_id: string;
  name: string;
  role: string;
  canonical_description: string;
  visual_traits: Record<string, string>;
  wardrobe: string[];
  voice_profile: Record<string, string>;
  reference_asset_ids: string[];
  continuity_notes: string;
};
type Location = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  visual_reference_ids: string[];
  continuity_notes: string;
};
type ReferenceImage = { id: string; name: string; mime_type: string | null; drive_file_id: string | null; project_id: string | null };
type Tab = "characters" | "locations";

const emptyCharacter = {
  name: "",
  role: "",
  canonical_description: "",
  age_range: "",
  skin_tone: "",
  hair: "",
  eyes: "",
  build: "",
  facial_features: "",
  signature_details: "",
  colour_palette: "",
  wardrobe: "",
  voice: "",
  continuity_notes: "",
};
const emptyLocation = { name: "", description: "", continuity_notes: "" };

function imageUrl(asset?: ReferenceImage) {
  return asset?.drive_file_id
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(asset.drive_file_id)}&sz=w320`
    : "";
}

function ReferenceStrip({ ids, assets }: { ids: string[]; assets: ReferenceImage[] }) {
  const selected = ids.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is ReferenceImage => Boolean(asset));
  if (!selected.length) return <span className="continuity-no-references">No reference images attached</span>;
  return (
    <div className="continuity-reference-strip">
      {selected.slice(0, 5).map((asset) => {
        const src = imageUrl(asset);
        return (
          <a className="continuity-reference-thumb" key={asset.id} href={asset.drive_file_id ? `https://drive.google.com/file/d/${encodeURIComponent(asset.drive_file_id)}/view` : "#"} target="_blank" rel="noreferrer" title={asset.name}>
            {src ? <img src={src} alt={asset.name} loading="lazy" onError={(event) => { event.currentTarget.style.opacity = "0"; }}/> : <Camera size={16}/>}
          </a>
        );
      })}
      {selected.length > 5 && <span className="continuity-more-references">+{selected.length - 5}</span>}
    </div>
  );
}

export default function CharactersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [projectImages, setProjectImages] = useState<ReferenceImage[]>([]);
  const [tab, setTab] = useState<Tab>("characters");
  const [characterForm, setCharacterForm] = useState(emptyCharacter);
  const [characterReferences, setCharacterReferences] = useState<string[]>([]);
  const [locationForm, setLocationForm] = useState(emptyLocation);
  const [locationReferences, setLocationReferences] = useState<string[]>([]);
  const [editingCharacter, setEditingCharacter] = useState("");
  const [editingLocation, setEditingLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRecords = useCallback(async (id: string) => {
    if (!id) {
      setCharacters([]);
      setLocations([]);
      setProjectImages([]);
      return;
    }
    const [characterResponse, locationResponse, assetResponse] = await Promise.all([
      fetch(`/api/characters?projectId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/locations?projectId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/assets?projectId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);
    const [characterData, locationData, assetData] = await Promise.all([
      characterResponse.json(), locationResponse.json(), assetResponse.json(),
    ]);
    if (!characterResponse.ok) throw new Error(characterData.error || "Could not load characters.");
    if (!locationResponse.ok) throw new Error(locationData.error || "Could not load locations.");
    if (!assetResponse.ok) throw new Error(assetData.error || "Could not load project media.");
    setCharacters(characterData.characters || []);
    setLocations(locationData.locations || []);
    setProjectImages((assetData.assets || []).filter((asset: ReferenceImage) => asset.mime_type?.startsWith("image/")));
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load projects.");
      const list: Project[] = data.projects || [];
      setProjects(list);
      const requestedProject = new URLSearchParams(window.location.search).get("projectId") || "";
      setProjectId(list.some((item) => item.id === requestedProject) ? requestedProject : list[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    void loadRecords(projectId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load project assets."));
  }, [projectId, loadRecords]);

  function editCharacter(item: Character) {
    setTab("characters");
    setEditingCharacter(item.id);
    setCharacterReferences(item.reference_asset_ids || []);
    setCharacterForm({
      name: item.name,
      role: item.role || "",
      canonical_description: item.canonical_description || "",
      age_range: item.visual_traits?.age_range || "",
      skin_tone: item.visual_traits?.skin_tone || "",
      hair: item.visual_traits?.hair || "",
      eyes: item.visual_traits?.eyes || "",
      build: item.visual_traits?.build || "",
      facial_features: item.visual_traits?.facial_features || "",
      signature_details: item.visual_traits?.signature_details || "",
      colour_palette: item.visual_traits?.colour_palette || "",
      wardrobe: (item.wardrobe || []).join("\n"),
      voice: item.voice_profile?.notes || "",
      continuity_notes: item.continuity_notes || "",
    });
  }

  function editLocation(item: Location) {
    setTab("locations");
    setEditingLocation(item.id);
    setLocationReferences(item.visual_reference_ids || []);
    setLocationForm({
      name: item.name,
      description: item.description || "",
      continuity_notes: item.continuity_notes || "",
    });
  }

  function resetCharacter() {
    setEditingCharacter("");
    setCharacterReferences([]);
    setCharacterForm(emptyCharacter);
  }

  function resetLocation() {
    setEditingLocation("");
    setLocationReferences([]);
    setLocationForm(emptyLocation);
  }

  async function saveCharacter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError("");
    setNotice("");
    const visual_traits = {
      age_range: characterForm.age_range.trim(),
      skin_tone: characterForm.skin_tone.trim(),
      hair: characterForm.hair.trim(),
      eyes: characterForm.eyes.trim(),
      build: characterForm.build.trim(),
      facial_features: characterForm.facial_features.trim(),
      signature_details: characterForm.signature_details.trim(),
      colour_palette: characterForm.colour_palette.trim(),
    };
    const payload = {
      project_id: projectId,
      name: characterForm.name.trim(),
      role: characterForm.role.trim(),
      canonical_description: characterForm.canonical_description.trim(),
      visual_traits,
      wardrobe: characterForm.wardrobe.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      voice_profile: characterForm.voice.trim() ? { notes: characterForm.voice.trim() } : {},
      reference_asset_ids: characterReferences,
      continuity_notes: characterForm.continuity_notes.trim(),
    };
    try {
      const response = await fetch(editingCharacter ? `/api/characters/${editingCharacter}` : "/api/characters", {
        method: editingCharacter ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save character.");
      resetCharacter();
      await loadRecords(projectId);
      setNotice("Character profile and reference images saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save character.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editingLocation ? `/api/locations/${editingLocation}` : "/api/locations", {
        method: editingLocation ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          ...locationForm,
          visual_reference_ids: locationReferences,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save location.");
      resetLocation();
      await loadRecords(projectId);
      setNotice("Location profile and reference images saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save location.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(kind: Tab, id: string) {
    const label = kind === "characters" ? "character" : "location";
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/${kind}/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed.");
      await loadRecords(projectId);
      setNotice(`${kind === "characters" ? "Character" : "Location"} deleted.`);
      if (editingCharacter === id) resetCharacter();
      if (editingLocation === id) resetLocation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const selectedProject = projects.find((project) => project.id === projectId);

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="PROJECT BIBLE"
        title="Characters & worlds"
        subtitle="Build reusable character identities and location references that can guide visual continuity across scenes."
        action={<button className="secondary-btn" type="button" onClick={() => void loadRecords(projectId)} disabled={!projectId || loading}><RefreshCw size={14}/> Refresh</button>}
      />

      {error && <div className="notice" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice success-notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}

      <section className="continuity-project-bar">
        <div>
          <span className="continuity-project-eyebrow">ACTIVE PROJECT</span>
          <strong>{selectedProject?.name || (loading ? "Loading projects…" : "Choose a project")}</strong>
          <span>Characters, places and visual references are stored inside this project.</span>
        </div>
        <label className="field-label">Project workspace
          <select className="field" value={projectId} onChange={(event) => {
            setProjectId(event.target.value);
            resetCharacter();
            resetLocation();
            setNotice("");
          }}>
            <option value="">Select a project</option>
            {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
          </select>
        </label>
      </section>

      {!projects.length && !loading ? (
        <div className="project-empty">
          <div className="project-empty-icon"><Users size={23}/></div>
          <h2>Create a project before building its visual bible</h2>
          <p>Character profiles and location references belong to a film or series project.</p>
          <Link className="primary-btn" href="/projects"><Plus size={14}/> Open projects</Link>
        </div>
      ) : (
        <>
          <div className="continuity-tabs" role="tablist" aria-label="Project bible sections">
            <button type="button" role="tab" aria-selected={tab === "characters"} className={tab === "characters" ? "active" : ""} onClick={() => setTab("characters")}><Users size={15}/> Characters <span>{characters.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "locations"} className={tab === "locations" ? "active" : ""} onClick={() => setTab("locations")}><MapPin size={15}/> Locations <span>{locations.length}</span></button>
          </div>

          {tab === "characters" ? (
            <div className="continuity-workspace">
              <section className="continuity-editor-panel">
                <div className="continuity-editor-heading">
                  <div className="continuity-editor-icon"><Users size={17}/></div>
                  <div><h2>{editingCharacter ? "Edit character profile" : "Create a character"}</h2><p>Define the identity that should stay recognisable from shot to shot.</p></div>
                </div>
                <form className="form-grid" onSubmit={saveCharacter}>
                  <div className="continuity-form-two">
                    <label className="field-label">Character name<input className="field" value={characterForm.name} onChange={(event) => setCharacterForm((v) => ({ ...v, name: event.target.value }))} maxLength={120} placeholder="e.g. Maya" required/></label>
                    <label className="field-label">Story role<input className="field" value={characterForm.role} onChange={(event) => setCharacterForm((v) => ({ ...v, role: event.target.value }))} maxLength={120} placeholder="Protagonist, supporting role…"/></label>
                  </div>
                  <label className="field-label">Canonical appearance<textarea className="field" rows={3} value={characterForm.canonical_description} onChange={(event) => setCharacterForm((v) => ({ ...v, canonical_description: event.target.value }))} maxLength={5000} placeholder="A concise, stable description of this character's overall appearance. Keep details consistent."/></label>

                  <div className="continuity-section-label"><span>IDENTITY DETAILS</span><span>Reusable visual traits</span></div>
                  <div className="continuity-trait-grid">
                    <label className="field-label">Age range<input className="field" value={characterForm.age_range} onChange={(event) => setCharacterForm((v) => ({ ...v, age_range: event.target.value }))} placeholder="Late 20s"/></label>
                    <label className="field-label">Skin tone<input className="field" value={characterForm.skin_tone} onChange={(event) => setCharacterForm((v) => ({ ...v, skin_tone: event.target.value }))} placeholder="Warm brown"/></label>
                    <label className="field-label">Hair<input className="field" value={characterForm.hair} onChange={(event) => setCharacterForm((v) => ({ ...v, hair: event.target.value }))} placeholder="Style, colour, length"/></label>
                    <label className="field-label">Eyes<input className="field" value={characterForm.eyes} onChange={(event) => setCharacterForm((v) => ({ ...v, eyes: event.target.value }))} placeholder="Colour and shape"/></label>
                    <label className="field-label">Build<input className="field" value={characterForm.build} onChange={(event) => setCharacterForm((v) => ({ ...v, build: event.target.value }))} placeholder="Height and build"/></label>
                    <label className="field-label">Facial features<input className="field" value={characterForm.facial_features} onChange={(event) => setCharacterForm((v) => ({ ...v, facial_features: event.target.value }))} placeholder="Distinctive facial details"/></label>
                  </div>
                  <label className="field-label">Signature details<input className="field" value={characterForm.signature_details} onChange={(event) => setCharacterForm((v) => ({ ...v, signature_details: event.target.value }))} placeholder="Freckles, jewellery, scar, glasses…"/></label>
                  <label className="field-label">Colour palette<input className="field" value={characterForm.colour_palette} onChange={(event) => setCharacterForm((v) => ({ ...v, colour_palette: event.target.value }))} placeholder="Muted earth tones, ivory and burgundy…"/></label>
                  <label className="field-label">Wardrobe · one outfit per line<textarea className="field" rows={3} value={characterForm.wardrobe} onChange={(event) => setCharacterForm((v) => ({ ...v, wardrobe: event.target.value }))} placeholder={"Default outfit: …\nAlternate outfit: …"}/></label>
                  <label className="field-label">Voice profile<textarea className="field" rows={2} value={characterForm.voice} onChange={(event) => setCharacterForm((v) => ({ ...v, voice: event.target.value }))} placeholder="Voice tone, pace, accent, delivery and speaking style…"/></label>

                  <ReferenceAssetPicker
                    projectId={projectId}
                    value={characterReferences}
                    onChange={setCharacterReferences}
                    title="Character reference images"
                    description="Attach approved portraits, turnarounds, expressions, wardrobe and pose references."
                    aspectRatio="1:1"
                    generationTarget={editingCharacter ? {
                      type: "character",
                      id: editingCharacter,
                      name: characterForm.name,
                      prompt: [
                        "Create a premium cinematic character turnaround reference sheet for one fictional character.",
                        "Show the exact same person in three clear full-body views: front view, side profile and back view, aligned on one clean studio canvas.",
                        "Keep the face, hairstyle, body proportions and clothing identical in all three views. Neutral light grey studio background, even soft lighting, realistic human anatomy, detailed natural skin texture, crisp costume details.",
                        "No text, no labels, no typography, no watermark, no logos, no extra people.",
                        "Character identity: " + characterForm.canonical_description,
                        "Age range: " + characterForm.age_range + ". Skin tone: " + characterForm.skin_tone + ". Hair: " + characterForm.hair + ". Eyes: " + characterForm.eyes + ". Build: " + characterForm.build + ". Facial features: " + characterForm.facial_features + ". Signature details: " + characterForm.signature_details + ".",
                        "Wardrobe: " + characterForm.wardrobe.split(/\r?\n/).filter(Boolean).join("; ") + ". Colour palette: " + characterForm.colour_palette + ".",
                      ].filter(Boolean).join(" ")
                    } : undefined}
                  />

                  <label className="field-label">Continuity rules<textarea className="field" rows={3} value={characterForm.continuity_notes} onChange={(event) => setCharacterForm((v) => ({ ...v, continuity_notes: event.target.value }))} maxLength={4000} placeholder="Details that must not change between shots: hairstyle, outfit, accessories, body proportions…"/></label>
                  <div className="continuity-form-actions">
                    <button className="primary-btn" disabled={busy || !projectId || characterForm.name.trim().length < 1}><Save size={14}/>{busy ? "Saving…" : editingCharacter ? "Save character" : "Create character"}</button>
                    {editingCharacter && <button type="button" className="secondary-btn" onClick={resetCharacter} disabled={busy}>Cancel edit</button>}
                  </div>
                </form>
              </section>

              <section className="continuity-record-panel">
                <div className="continuity-record-heading"><div><h2>Cast & character bible</h2><p>{characters.length} saved character{characters.length === 1 ? "" : "s"} in this project</p></div><span className="continuity-count">{characters.length.toString().padStart(2, "0")}</span></div>
                {characters.length ? (
                  <div className="continuity-record-list">
                    {characters.map((item) => (
                      <article className="continuity-record-card" key={item.id}>
                        <div className="continuity-record-card-head">
                          <div className="continuity-record-symbol"><Users size={17}/></div>
                          <div className="continuity-record-title"><h3>{item.name}</h3><span>{item.role || "Character"}</span></div>
                          <div className="continuity-record-actions"><button className="secondary-btn" type="button" onClick={() => editCharacter(item)}>Edit</button><button className="danger-btn" type="button" disabled={busy} onClick={() => void removeItem("characters", item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={13}/></button></div>
                        </div>
                        <p className="continuity-record-description">{item.canonical_description || item.visual_traits?.signature_details || "No canonical appearance description yet."}</p>
                        <div className="continuity-trait-tags">
                          {[item.visual_traits?.hair, item.visual_traits?.eyes, item.visual_traits?.skin_tone, item.visual_traits?.build].filter(Boolean).slice(0, 4).map((trait, index) => <span key={index}>{trait}</span>)}
                          <span>{(item.wardrobe || []).length} wardrobe note{(item.wardrobe || []).length === 1 ? "" : "s"}</span>
                        </div>
                        <ReferenceStrip ids={item.reference_asset_ids || []} assets={projectImages}/>
                        {item.voice_profile?.notes && <div className="continuity-voice-note"><Volume2 size={13}/>{item.voice_profile.notes}</div>}
                        {item.continuity_notes && <div className="continuity-rule-note"><strong>Continuity rules</strong><span>{item.continuity_notes}</span></div>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="continuity-empty"><div><Users size={21}/></div><strong>Your cast is empty</strong><p>Create the first character profile and attach reference images to establish a consistent visual identity.</p></div>
                )}
              </section>
            </div>
          ) : (
            <div className="continuity-workspace">
              <section className="continuity-editor-panel">
                <div className="continuity-editor-heading">
                  <div className="continuity-editor-icon"><MapPin size={17}/></div>
                  <div><h2>{editingLocation ? "Edit location profile" : "Create a location"}</h2><p>Record the visual details that make each recurring environment recognisable.</p></div>
                </div>
                <form className="form-grid" onSubmit={saveLocation}>
                  <label className="field-label">Location name<input className="field" value={locationForm.name} onChange={(event) => setLocationForm((v) => ({ ...v, name: event.target.value }))} maxLength={120} placeholder="e.g. Maya's apartment" required/></label>
                  <label className="field-label">Visual description<textarea className="field" rows={5} value={locationForm.description} onChange={(event) => setLocationForm((v) => ({ ...v, description: event.target.value }))} maxLength={5000} placeholder="Architecture, layout, colour palette, lighting, textures and atmosphere…"/></label>
                  <ReferenceAssetPicker
                    projectId={projectId}
                    value={locationReferences}
                    onChange={setLocationReferences}
                    title="Location reference images"
                    description="Attach environment photos, set designs, lighting references or approved backgrounds."
                    aspectRatio="16:9"
                    generationTarget={editingLocation ? {
                      type: "location",
                      id: editingLocation,
                      name: locationForm.name,
                      prompt: [
                        "Create a high-end cinematic production-design environment reference for a fictional film location.",
                        "Show one clear wide establishing view with no people, no text, no labels, no watermark and no logos.",
                        "Believable architecture, coherent spatial layout, detailed materials, motivated cinematic lighting, rich but natural textures, film production concept art with realistic photographic detail.",
                        "Location: " + locationForm.name + ".",
                        "Environment description: " + locationForm.description,
                        "Continuity requirements: " + locationForm.continuity_notes,
                      ].filter(Boolean).join(" ")
                    } : undefined}
                  />
                  <label className="field-label">Environment continuity rules<textarea className="field" rows={3} value={locationForm.continuity_notes} onChange={(event) => setLocationForm((v) => ({ ...v, continuity_notes: event.target.value }))} maxLength={4000} placeholder="Keep the window position, furniture, wall colours, time of day and lighting consistent…"/></label>
                  <div className="continuity-form-actions">
                    <button className="primary-btn" disabled={busy || !projectId || locationForm.name.trim().length < 1}><Save size={14}/>{busy ? "Saving…" : editingLocation ? "Save location" : "Create location"}</button>
                    {editingLocation && <button type="button" className="secondary-btn" onClick={resetLocation} disabled={busy}>Cancel edit</button>}
                  </div>
                </form>
              </section>

              <section className="continuity-record-panel">
                <div className="continuity-record-heading"><div><h2>World & environment bible</h2><p>{locations.length} saved location{locations.length === 1 ? "" : "s"} in this project</p></div><span className="continuity-count">{locations.length.toString().padStart(2, "0")}</span></div>
                {locations.length ? (
                  <div className="continuity-record-list">
                    {locations.map((item) => (
                      <article className="continuity-record-card" key={item.id}>
                        <div className="continuity-record-card-head">
                          <div className="continuity-record-symbol location"><MapPin size={17}/></div>
                          <div className="continuity-record-title"><h3>{item.name}</h3><span>Recurring environment</span></div>
                          <div className="continuity-record-actions"><button className="secondary-btn" type="button" onClick={() => editLocation(item)}>Edit</button><button className="danger-btn" type="button" disabled={busy} onClick={() => void removeItem("locations", item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={13}/></button></div>
                        </div>
                        <p className="continuity-record-description">{item.description || "No visual description added yet."}</p>
                        <ReferenceStrip ids={item.visual_reference_ids || []} assets={projectImages}/>
                        {item.continuity_notes && <div className="continuity-rule-note"><strong>Environment continuity</strong><span>{item.continuity_notes}</span></div>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="continuity-empty"><div><MapPin size={21}/></div><strong>No locations saved</strong><p>Add recurring sets and environments with visual references so they can be reused across scenes.</p></div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
