"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Music2, Plus, RefreshCw, Trash2, Volume2 } from "lucide-react";
import { PageHeading, EmptyState } from "@/components/ui";
import { UploadMediaButton } from "@/components/upload-media-button";
import { formatBytes, formatDate } from "@/lib/utils";

type Project = { id: string; name: string };
type Episode = { id: string; title: string };
type AudioAsset = { id: string; name: string; mime_type: string | null; file_size: number | null; drive_file_id: string | null; created_at: string; source_type: string };
type ReferenceAsset = { id: string; name: string; mime_type: string | null; drive_file_id: string | null };
type VoiceLine = { id: string; speaker: string; voiceId: string; text: string; speed: number };
type AudioEngine = "kokoro" | "edge-tts";
type CastVoice = { id: string; name: string; voice_profile?: Record<string, string> | null; reference_asset_ids?: string[] | null };

const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart · American female" },
  { id: "af_bella", label: "Bella · American female" },
  { id: "af_sarah", label: "Sarah · American female" },
  { id: "af_nicole", label: "Nicole · American female" },
  { id: "am_michael", label: "Michael · American male" },
  { id: "am_fenrir", label: "Fenrir · American male" },
  { id: "am_puck", label: "Puck · American male" },
  { id: "bf_emma", label: "Emma · British female" },
  { id: "bf_isabella", label: "Isabella · British female" },
  { id: "bm_george", label: "George · British male" },
  { id: "bm_lewis", label: "Lewis · British male" },
];

const EDGE_VOICES = [
  { id: "en-US-ChristopherNeural", label: "Christopher · American male" },
  { id: "en-US-JennyNeural", label: "Jenny · American female" },
  { id: "en-US-AnaNeural", label: "Ana · American female (youthful)" },
  { id: "en-US-GuyNeural", label: "Guy · American male" },
  { id: "en-US-SteffanNeural", label: "Steffan · American male narrator" },
];

export default function AudioPage() {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [cast, setCast] = useState<CastVoice[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [speaker, setSpeaker] = useState("Narrator");
  const [engine, setEngine] = useState<AudioEngine>("kokoro");
  const [voiceId, setVoiceId] = useState("af_heart");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [jobProgress, setJobProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lipSyncCharacterId, setLipSyncCharacterId] = useState("");
  const [lipSyncPortraitId, setLipSyncPortraitId] = useState("");
  const [lipSyncAudioId, setLipSyncAudioId] = useState("");
  const [lipSyncJobId, setLipSyncJobId] = useState("");
  const [lipSyncStatus, setLipSyncStatus] = useState("");
  const [lipSyncProgress, setLipSyncProgress] = useState(0);

  const voices = engine === "edge-tts" ? EDGE_VOICES : KOKORO_VOICES;
  const lipSyncCharacter = cast.find((item) => item.id === lipSyncCharacterId);
  const lipSyncPortraits = lipSyncCharacterId
    ? referenceAssets.filter((asset) => (lipSyncCharacter?.reference_asset_ids || []).includes(asset.id))
    : referenceAssets;

  const loadAssets = useCallback(async (project?: string) => {
    const path = project ? "/api/assets?projectId=" + encodeURIComponent(project) : "/api/assets";
    const response = await fetch(path, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load audio assets.");
    const allAssets: AudioAsset[] = data.assets || [];
    setAssets(allAssets.filter((asset) => asset.mime_type?.startsWith("audio/")));
    setReferenceAssets(allAssets.filter((asset) => asset.mime_type?.startsWith("image/") && asset.drive_file_id));
  }, []);

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load projects.");
    const list: Project[] = data.projects || [];
    setProjects(list);
    setProjectId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await Promise.all([loadAssets(), loadProjects()]);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load the voice studio.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadAssets, loadProjects]);

  useEffect(() => {
    if (!projectId) { setEpisodes([]); setEpisodeId(""); setReferenceAssets([]); return; }
    void loadAssets(projectId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load project assets."));
    let active = true;
    fetch("/api/projects/" + projectId, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load episodes.");
        if (active) {
          const list: Episode[] = data.episodes || [];
          setEpisodes(list);
          setEpisodeId((current) => list.some((item) => item.id === current) ? current : "");
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load episodes."); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) { setCast([]); return; }
    let active = true;
    fetch("/api/characters?projectId=" + encodeURIComponent(projectId), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the project character voice profiles.");
        if (active) setCast(data.characters || []);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load character voice profiles."); });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check voice-generation status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === jobId);
        if (!active || !job) return;
        setJobStatus(job.status);
        setJobProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setJobId("");
          setNotice("Generated dialogue audio, the combined track and any word-timed subtitle files have been added to your project Media Library.");
          await loadAssets(projectId);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setJobId("");
          setError(job.last_error || "Voice generation did not complete. Review the Production queue.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check job status.");
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId, loadAssets, projectId]);

  useEffect(() => {
    if (!lipSyncJobId) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check talking-character job status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === lipSyncJobId);
        if (!active || !job) return;
        setLipSyncStatus(job.status);
        setLipSyncProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setLipSyncJobId("");
          setNotice("Talking-character clip is ready in the project Media Library.");
          await loadAssets(projectId);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setLipSyncJobId("");
          setError(job.last_error || "MuseTalk lip-sync did not complete. Review the Production queue and Kaggle worker output.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check talking-character job.");
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [lipSyncJobId, projectId, loadAssets]);

  function useSavedCharacterVoice() {
    const character = cast.find((item) => item.name.trim().toLowerCase() === speaker.trim().toLowerCase());
    if (!character) { setError("No saved character profile matches this speaker name in the selected project."); return; }
    const profile = character.voice_profile || {};
    const saved = engine === "edge-tts" ? profile.edge_tts_voice : profile.kokoro_voice_id;
    const allowed = voices.some((voice) => voice.id === saved);
    if (!allowed || !saved) {
      setError(engine === "edge-tts" ? "This character has no Edge TTS voice assigned in the NELLWICK Bible." : "This character has no Kokoro preset assigned in the NELLWICK Bible.");
      return;
    }
    setVoiceId(saved);
    setError("");
    setNotice("Loaded the saved voice profile for " + character.name + ".");
  }
  function addLine() {
    setError("");
    const cleanText = text.trim();
    if (!cleanText) { setError("Write the dialogue or narration before adding the line."); return; }
    if (!speaker.trim()) { setError("Enter the character or narrator name."); return; }
    if (lines.length >= 30) { setError("A single voice job can contain up to 30 lines."); return; }
    setLines((current) => [...current, { id: crypto.randomUUID(), speaker: speaker.trim(), voiceId, text: cleanText, speed }]);
    setText("");
    setNotice("Dialogue line added to this voice session.");
  }

  async function queueLipSync() {
    if (!projectId) { setError("Select a project first."); return; }
    if (!lipSyncPortraitId) { setError("Choose an approved character portrait."); return; }
    if (!lipSyncAudioId) { setError("Choose a generated dialogue audio file."); return; }
    if (lipSyncCharacterId && !(lipSyncCharacter?.reference_asset_ids || []).includes(lipSyncPortraitId)) {
      setError("Attach this portrait to the character's approved reference images first.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/jobs/lipsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, episodeId: episodeId || null,
          characterId: lipSyncCharacterId || null,
          portraitAssetId: lipSyncPortraitId, audioAssetId: lipSyncAudioId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue talking-character generation.");
      setLipSyncJobId(data.job.id); setLipSyncStatus("queued"); setLipSyncProgress(0);
      setNotice("MuseTalk talking-character job queued. The first run installs a separate Python 3.10 runtime and downloads model weights; keep Kaggle running.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue talking-character generation.");
    } finally { setBusy(false); }
  }

  async function queueGeneration() {
    if (!projectId) { setError("Create or select a NELLWICK project first."); return; }
    const segments = [...lines];
    if (text.trim()) segments.push({ id: crypto.randomUUID(), speaker: speaker.trim() || "Narrator", voiceId, text: text.trim(), speed });
    if (!segments.length) { setError("Add at least one dialogue or narration line."); return; }
    if (segments.length > 30) { setError("A voice job can contain up to 30 lines."); return; }

    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/jobs/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeId: episodeId || null, engine, segments }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue voice generation.");
      setLines([]); setText("");
      setJobId(data.job.id); setJobStatus("queued"); setJobProgress(0);
      setNotice("Kokoro voice generation queued. Start your Kaggle worker to process it.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue voice generation.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-wrap">
    <PageHeading
      eyebrow="LOCAL VOICE PRODUCTION"
      title="Voice & audio"
      subtitle="Generate character dialogue and narration with optional online Edge voices or local Kokoro, then manage the audio and subtitle files stored in your connected Google Drive."
      action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary-btn" onClick={() => void loadAssets(projectId)}><RefreshCw size={14}/>Refresh</button>
        <UploadMediaButton onUploaded={() => void loadAssets(projectId)}/>
      </div>}
    />

    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-heading">
        <div><div className="panel-title">Dialogue & narration generator</div><div className="panel-subtitle">Choose local/offline or optional online speech generation. No paid speech API is required.</div></div>
        <span className="pill">{engine === "edge-tts" ? "Edge TTS · online" : "Kokoro 82M · local"}</span>
      </div>
      <div className="notice" style={{ marginTop: 12 }}>
        Add one line per speaker and keep the same voice preset assigned to each recurring character. Edge TTS can return word-boundary subtitles but needs internet and may be throttled. Kokoro runs locally and is the offline fallback. Neither engine clones your character voice or guarantees lip-sync.
      </div>
      {projects.length ? <>
        <div className="form-grid" style={{ marginTop: 16, gridTemplateColumns: "1fr 1fr" }}>
          <label className="field-label">Project
            <select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="field-label">Episode
            <select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}>
              <option value="">General project audio</option>
              {episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid" style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr" }}>
          <label className="field-label">Speech engine
            <select className="field" value={engine} disabled={lines.length > 0} onChange={(event) => { const next = event.target.value as AudioEngine; setEngine(next); setVoiceId(next === "edge-tts" ? "en-US-JennyNeural" : "af_heart"); }}>
              <option value="kokoro">Kokoro 82M · local / offline</option>
              <option value="edge-tts">Microsoft Edge TTS · online / optional</option>
            </select>
          </label>
          <div className="notice" style={{ marginTop: 20 }}>{engine === "edge-tts" ? "Online service: may be throttled, can change without notice and is not promised unlimited. Produces MP3 and timed SRT subtitle assets." : "Local speech synthesis: no external inference request. Uses preset voices and produces WAV tracks."}</div>
          <label className="field-label">Speaker / character
            <input className="field" value={speaker} onChange={(event) => setSpeaker(event.target.value)} maxLength={80} placeholder="e.g. Grace"/>
          </label>
          <label className="field-label">Voice preset
            <select className="field" value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
              {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
            </select>
          </label>
          <button className="secondary-btn" type="button" onClick={useSavedCharacterVoice} disabled={!cast.length}>Use saved character voice</button>
          <label className="field-label">Speaking speed · {speed.toFixed(2)}×
            <input className="field" type="range" min="0.75" max="1.25" step="0.05" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}/>
          </label>
        </div>
        <label className="field-label" style={{ display: "block", marginTop: 14 }}>Dialogue / narration
          <textarea className="field" rows={4} value={text} onChange={(event) => setText(event.target.value)} maxLength={3000} placeholder="Write one character line or narration passage..."/>
          <span className="muted">{text.length.toLocaleString()} / 3,000 characters</span>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="secondary-btn" onClick={addLine}><Plus size={14}/>Add line to session</button>
          <button className="primary-btn" onClick={() => void queueGeneration()} disabled={busy || !!jobId || !!lipSyncJobId}>
            <Volume2 size={14}/>{busy ? "Queueing…" : "Generate dialogue audio"}
          </button>
        </div>
        {lines.length > 0 && <div style={{ marginTop: 18 }}>
          <div className="panel-title">Lines in this session · {lines.length}</div>
          <div className="project-list" style={{ marginTop: 8 }}>
            {lines.map((line, index) => <div className="project-row" key={line.id}>
              <div className="project-thumb"><Volume2 size={18}/></div>
              <div className="project-info"><strong>{index + 1}. {line.speaker} · {voices.find((voice) => voice.id === line.voiceId)?.label || line.voiceId}</strong><span>{line.text}</span></div>
              <button className="icon-btn" aria-label="Remove dialogue line" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 size={15}/></button>
            </div>)}
          </div>
        </div>}
      </> : <EmptyState title="Create your first project" copy="Create a NELLWICK ORIGINALS project before generating dialogue." href="/projects" actionLabel="Open projects"/>}
      {jobId && <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><div><div className="panel-title">Voice job in progress</div><div className="panel-subtitle">{jobStatus || "Checking queue"} · {jobProgress}%</div></div><span className="pill">{jobStatus || "queued"}</span></div>
        <div style={{ height: 7, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 12 }}><div style={{ width: jobProgress + "%", height: "100%", background: "var(--accent)", transition: "width .25s" }}/></div>
      </div>}
    </section>

    {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}

    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-heading">
        <div><div className="panel-title">Talking-character lip-sync · Experimental</div><div className="panel-subtitle">Animate the mouth of an approved portrait from a dialogue or narration track.</div></div>
        <span className="pill">MuseTalk 1.5 · Kaggle GPU</span>
      </div>
      <div className="notice" style={{ marginTop: 12 }}>
        Use one clear, front-facing portrait and a short English dialogue line (maximum 60 seconds). This creates a talking close-up from one still image. It does not animate the character&apos;s body or guarantee perfect identity preservation. The first job installs a separate Python 3.10 environment and downloads several model weights; later jobs in the same Kaggle session can reuse them. Use a single-person, front-facing portrait. This worker caps each shot at 60 seconds. Review MuseTalk&apos;s training-data commercialisation notice before using generated output in monetized publishing.
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
        <label className="field-label">Character (optional)
          <select className="field" value={lipSyncCharacterId} onChange={(event) => {
            const nextId = event.target.value;
            setLipSyncCharacterId(nextId);
            const item = cast.find((entry) => entry.id === nextId);
            const firstRef = item?.reference_asset_ids?.find((id) => referenceAssets.some((asset) => asset.id === id)) || "";
            setLipSyncPortraitId(firstRef);
          }}>
            <option value="">Unassigned portrait</option>
            {cast.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field-label">Approved portrait image
          <select className="field" value={lipSyncPortraitId} onChange={(event) => setLipSyncPortraitId(event.target.value)}>
            <option value="">Select a reference image</option>
            {lipSyncPortraits.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <span className="muted">{lipSyncPortraits.length} project images available. Attach character references in Characters & Worlds.</span>
        </label>
        <label className="field-label">Dialogue / narration audio
          <select className="field" value={lipSyncAudioId} onChange={(event) => setLipSyncAudioId(event.target.value)}>
            <option value="">Select an audio track</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button className="primary-btn" onClick={() => void queueLipSync()} disabled={busy || !!jobId || !!lipSyncJobId || !referenceAssets.length || !assets.length}>
          <Volume2 size={14}/>{busy ? "Queueing…" : "Generate talking-character clip"}
        </button>
        <Link className="secondary-btn" href="/characters">Manage approved character references</Link>
      </div>
      {lipSyncJobId && <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-heading"><div><div className="panel-title">MuseTalk job · {lipSyncStatus}</div><div className="panel-subtitle">{lipSyncProgress}% complete</div></div><span className="pill">{lipSyncStatus}</span></div>
        <div style={{ height: 7, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
          <div style={{ width: lipSyncProgress + "%", height: "100%", background: "var(--accent)", transition: "width .25s" }}/>
        </div>
      </div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><div className="panel-title">Generated and uploaded audio</div><div className="panel-subtitle">Individual character lines and combined dialogue tracks.</div></div><span className="pill">{assets.length} files</span></div>
      {loading ? <div className="muted" style={{ padding: 16 }}>Loading audio library…</div> : assets.length ? <div className="project-list">
        {assets.map((asset) => <div className="project-row" key={asset.id}>
          <div className="project-thumb"><Music2 size={20}/></div>
          <div className="project-info"><strong>{asset.name}</strong><span>{asset.mime_type || "Audio"} · {formatBytes(asset.file_size)} · {formatDate(asset.created_at)}</span></div>
          <span className="pill">{asset.source_type}</span>
          {asset.drive_file_id && <>
            <a className="secondary-btn" target="_blank" rel="noreferrer" href={"https://drive.google.com/file/d/" + encodeURIComponent(asset.drive_file_id) + "/view"}><ExternalLink size={13}/>Preview</a>
            <a className="secondary-btn" target="_blank" rel="noreferrer" href={"https://drive.google.com/uc?export=download&id=" + encodeURIComponent(asset.drive_file_id)}><Download size={13}/>Download</a>
          </>}
        </div>)}
      </div> : <EmptyState title="No audio files yet" copy="Generate a test line above or upload existing narration, dialogue, music or sound effects." href="/media" actionLabel="Open media library"/>}
    </section>

    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-title">Current speech-engine limits</div>
      <p className="panel-subtitle" style={{ marginTop: 8 }}>Edge TTS is an online service that may be throttled and does not provide an unlimited-use guarantee. Kokoro is local and uses preset voices, not voice cloning. Keep one voice ID assigned to each recurring fictional character. Lily’s Edge preset is a youthful available voice, not a true child voice; review it carefully. Both engines need human review for emotion and timing. Lip-sync, music generation and sound-effect generation are separate stages.</p>
      <Link className="text-link" href="/production">Open production queue</Link>
    </div>
  </div>;
}
