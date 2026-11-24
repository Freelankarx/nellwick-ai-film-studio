"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, AudioLines, Film, Image as ImageIcon, Music2, Plus, RefreshCw, Save, Trash2, Volume2 } from "lucide-react";
import { PageHeading } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/utils";

type Project = { id: string; name: string };
type Episode = { id: string; title: string; aspect_ratio: string; production_manifest: Record<string, unknown> | null };
type Asset = { id: string; name: string; mime_type: string | null; drive_file_id: string | null; file_size: number | null; source_type?: string };
type Clip = {
  id: string; asset_id: string; name: string; drive_file_id: string | null;
  start_seconds: number; duration_seconds: number; source_start_seconds: number; motion: "slow_zoom" | "static";
};
type AudioTrack = {
  id: string; asset_id: string; name: string; drive_file_id: string | null;
  kind: "dialogue" | "narration" | "music" | "sfx";
  start_seconds: number; source_start_seconds: number; duration_seconds: number;
  volume: number; loop: boolean;
};
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function readEditor(value: unknown) {
  const editor = asRecord(asRecord(value).editor);
  const clips = Array.isArray(editor.clips) ? editor.clips.filter((item) => item && typeof item === "object" && typeof (item as Clip).asset_id === "string") as Clip[] : [];
  const audioTracks = Array.isArray(editor.audio_tracks) ? editor.audio_tracks.filter((item) => item && typeof item === "object" && typeof (item as AudioTrack).asset_id === "string") as AudioTrack[] : [];
  return { clips, audioTracks, subtitleAssetId: typeof editor.subtitle_asset_id === "string" ? editor.subtitle_asset_id : "" };
}

export default function EditorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleAssetId, setSubtitleAssetId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [audioKind, setAudioKind] = useState<AudioTrack["kind"]>("dialogue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renderJobId, setRenderJobId] = useState("");
  const [renderStatus, setRenderStatus] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);

  const selectedEpisode = episodes.find((item) => item.id === episodeId);
  const videoAssets = useMemo(() => assets.filter((asset) => asset.mime_type?.startsWith("video/")), [assets]);
  const imageAssets = useMemo(() => assets.filter((asset) => asset.mime_type?.startsWith("image/")), [assets]);
  const audioAssets = useMemo(() => assets.filter((asset) => asset.mime_type?.startsWith("audio/")), [assets]);
  const subtitleAssets = useMemo(() => assets.filter((asset) => /.srt$/i.test(asset.name) || asset.mime_type === "application/x-subrip" || asset.mime_type?.startsWith("text/")), [assets]);
  const totalSeconds = clips.reduce((sum, clip) => Math.max(sum, clip.start_seconds + clip.duration_seconds), 0);

  const loadAssets = useCallback(async (id: string) => {
    if (!id) { setAssets([]); return; }
    const response = await fetch("/api/assets?projectId=" + encodeURIComponent(id), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load project media.");
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
    (async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load projects.");
        if (active) {
          setProjects(data.projects || []);
          setProjectId(data.projects?.[0]?.id || "");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load the editor.");
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadEpisodes(projectId), loadAssets(projectId)])
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load project content."); });
    return () => { active = false; };
  }, [projectId, loadEpisodes, loadAssets]);

  useEffect(() => {
    const saved = readEditor(selectedEpisode?.production_manifest);
    setClips(saved.clips);
    setAudioTracks(saved.audioTracks);
    setSubtitleAssetId(saved.subtitleAssetId);
  }, [episodeId, selectedEpisode?.id]);

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
        if (!response.ok) throw new Error(data.error || "Could not check render status.");
        const job = (data.jobs || []).find((item: { id: string }) => item.id === renderJobId);
        if (!active || !job) return;
        setRenderStatus(job.status);
        setRenderProgress(Number(job.progress || 0));
        if (job.status === "completed") {
          setRenderJobId("");
          setNotice("Episode master is ready. The final MP4 has been added to this project's Media Library.");
          await loadAssets(projectId);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setRenderJobId("");
          setError(job.last_error || "Episode render did not finish. Check the Production queue.");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not check render status.");
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [renderJobId, projectId, loadAssets]);

  function addClip(asset: Asset) {
    if (clips.some((clip) => clip.asset_id === asset.id)) return;
    const start = clips.reduce((max, item) => Math.max(max, item.start_seconds + item.duration_seconds), 0);
    setClips((current) => [...current, {
      id: crypto.randomUUID(), asset_id: asset.id, name: asset.name, drive_file_id: asset.drive_file_id,
      start_seconds: start, duration_seconds: 5, source_start_seconds: 0, motion: "slow_zoom",
    }]);
  }

  function moveClip(index: number, delta: -1 | 1) {
    setClips((current) => {
      const result = [...current];
      const destination = index + delta;
      if (destination < 0 || destination >= result.length) return current;
      [result[index], result[destination]] = [result[destination], result[index]];
      let cursor = 0;
      return result.map((clip) => {
        const next = { ...clip, start_seconds: cursor };
        cursor += clip.duration_seconds;
        return next;
      });
    });
  }

  function addAudioTrack() {
    const asset = audioAssets.find((item) => item.id === selectedAudioId);
    if (!asset) { setError("Choose an audio asset first."); return; }
    if (audioTracks.some((track) => track.asset_id === asset.id)) { setError("This audio file is already on the timeline."); return; }
    setAudioTracks((current) => [...current, {
      id: crypto.randomUUID(), asset_id: asset.id, name: asset.name, drive_file_id: asset.drive_file_id,
      kind: audioKind, start_seconds: 0, source_start_seconds: 0,
      duration_seconds: Math.max(1, totalSeconds), volume: audioKind === "music" ? 0.18 : 1, loop: audioKind === "music",
    }]);
    setNotice("Audio track added. Adjust its start, duration and volume before rendering.");
    setError("");
  }

  async function saveTimeline() {
    if (!episodeId || !selectedEpisode) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const existing = selectedEpisode.production_manifest || {};
      const manifest = {
        ...existing,
        editor: {
          version: 2, clips, audio_tracks: audioTracks,
          subtitle_asset_id: subtitleAssetId || null,
          total_duration_seconds: totalSeconds,
          updated_at: new Date().toISOString(),
        },
      };
      const response = await fetch("/api/episodes/" + episodeId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_manifest: manifest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the timeline.");
      setEpisodes((current) => current.map((item) => item.id === episodeId ? data.episode : item));
      setNotice("Timeline, audio tracks and subtitle selection saved to this episode.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the timeline.");
      return false;
    } finally { setBusy(false); }
  }

  async function queueEpisodeRender() {
    if (!episodeId) return;
    if (!clips.length) { setError("Add at least one video or image clip before rendering."); return; }
    if (!audioTracks.length) { setError("Add dialogue, narration, music or SFX. NELLWICK refuses to export a silent episode."); return; }
    const saved = await saveTimeline();
    if (!saved) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/jobs/render-episode", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, subtitleAssetId: subtitleAssetId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue episode rendering.");
      setRenderJobId(data.job.id); setRenderStatus("queued"); setRenderProgress(0);
      setNotice("Episode render queued. Start your Kaggle worker to render the master, mix the audio tracks and upload the finished MP4.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue episode rendering.");
    } finally { setBusy(false); }
  }

  return <div className="page-wrap">
    <PageHeading eyebrow="POST-PRODUCTION" title="Film editor" subtitle="Build a picture edit, add dialogue/music/SFX tracks, burn subtitles and render a real episode master through the Kaggle worker."/>
    {error && <div className="notice" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
    {notice && <div className="notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}

    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field-label">Project
          <select className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Select project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field-label">Episode
          <select className="field" value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}>
            <option value="">Select episode</option>{episodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </div>
      {!projects.length && <p className="muted">Create a project first. <Link className="text-link" href="/projects">Open projects</Link></p>}
    </section>

    {episodeId && <>
      <div className="content-grid" style={{ alignItems: "start" }}>
        <section className="panel">
          <div className="panel-heading"><div><div className="panel-title"><Film size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}/>Picture assets</div><div className="panel-subtitle">Add existing generated clips or still reference images to the episode.</div></div><span className="pill">{videoAssets.length + imageAssets.length}</span></div>
          {[...videoAssets, ...imageAssets].length ? <div className="project-list">
            {[...videoAssets, ...imageAssets].map((asset) => <div className="project-row" key={asset.id}>
              <div className="project-thumb">{asset.mime_type?.startsWith("image/") ? <ImageIcon size={18}/> : <Film size={18}/>}</div>
              <div className="project-info"><strong>{asset.name}</strong><span>{asset.mime_type} · {asset.file_size ? formatBytes(asset.file_size) : "Media asset"} · {asset.source_type || "stored"}</span></div>
              <button className="secondary-btn" onClick={() => addClip(asset)} disabled={clips.some((item) => item.asset_id === asset.id)}><Plus size={13}/>Add to picture</button>
            </div>)}
          </div> : <div className="empty-card"><div className="empty-title">No picture assets yet</div><p className="empty-copy">Upload or generate footage and stills in the Media Library.</p><Link className="secondary-btn" href="/media">Open media library</Link></div>}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><div className="panel-title"><AudioLines size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}/>Audio library</div><div className="panel-subtitle">Add generated dialogue, narration, music and effects.</div></div><span className="pill">{audioAssets.length}</span></div>
          {audioAssets.length ? <>
            <label className="field-label">Audio file<select className="field" value={selectedAudioId} onChange={(event) => setSelectedAudioId(event.target.value)}><option value="">Choose audio</option>{audioAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr auto", alignItems: "end", marginTop: 10 }}>
              <label className="field-label">Track type<select className="field" value={audioKind} onChange={(event) => setAudioKind(event.target.value as AudioTrack["kind"])}><option value="dialogue">Dialogue</option><option value="narration">Narration</option><option value="music">Music</option><option value="sfx">Sound effects</option></select></label>
              <button className="primary-btn" onClick={addAudioTrack} disabled={!selectedAudioId}><Plus size={13}/>Add audio track</button>
            </div>
          </> : <p className="muted">Generate or upload audio in <Link className="text-link" href="/audio">Voice & audio</Link> or the Media Library.</p>}
          <label className="field-label" style={{ display: "block", marginTop: 16 }}>Subtitle file (optional)
            <select className="field" value={subtitleAssetId} onChange={(event) => setSubtitleAssetId(event.target.value)}>
              <option value="">No subtitle burn-in</option>{subtitleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
          </label>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div><div className="panel-title">Picture timeline</div><div className="panel-subtitle">{clips.length} clips · {totalSeconds.toFixed(1)} seconds planned · {selectedEpisode?.aspect_ratio || "16:9"} output</div></div>
          <button className="secondary-btn" onClick={() => void saveTimeline()} disabled={busy}><Save size={14}/>Save timeline</button>
        </div>
        {clips.length ? <div className="form-grid">{clips.map((clip, index) => <article className="panel" key={clip.id}>
          <div className="panel-heading">
            <div className="panel-title">{index + 1}. {clip.name}</div>
            <div style={{ display: "flex", gap: 5 }}>
              <button className="secondary-btn" onClick={() => moveClip(index, -1)} disabled={!index}><ArrowUp size={13}/></button>
              <button className="secondary-btn" onClick={() => moveClip(index, 1)} disabled={index === clips.length - 1}><ArrowDown size={13}/></button>
              <button className="danger-btn" onClick={() => setClips((current) => current.filter((item) => item.id !== clip.id))}><Trash2 size={13}/></button>
            </div>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="field-label">Timeline start (s)<input className="field" type="number" min="0" step="0.1" value={clip.start_seconds} onChange={(event) => setClips((current) => current.map((item) => item.id === clip.id ? { ...item, start_seconds: Math.max(0, Number(event.target.value)) } : item))}/></label>
            <label className="field-label">Clip duration (s)<input className="field" type="number" min="0.25" step="0.5" value={clip.duration_seconds} onChange={(event) => setClips((current) => current.map((item) => item.id === clip.id ? { ...item, duration_seconds: Math.max(0.25, Number(event.target.value)) } : item))}/></label>
            {clip.drive_file_id && <label className="field-label">Source in-point (s)<input className="field" type="number" min="0" step="0.1" value={clip.source_start_seconds} onChange={(event) => setClips((current) => current.map((item) => item.id === clip.id ? { ...item, source_start_seconds: Math.max(0, Number(event.target.value)) } : item))}/></label>}
            {assets.find((item) => item.id === clip.asset_id)?.mime_type?.startsWith("image/") && <label className="field-label">Still-image motion<select className="field" value={clip.motion} onChange={(event) => setClips((current) => current.map((item) => item.id === clip.id ? { ...item, motion: event.target.value as Clip["motion"] } : item))}><option value="slow_zoom">Slow cinematic zoom</option><option value="static">Static frame</option></select></label>}
          </div>
        </article>)}</div> : <div className="empty-card"><div className="empty-title">Picture timeline is empty</div><p className="empty-copy">Add generated clips or still images from the panel above.</p></div>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><div><div className="panel-title">Audio timeline</div><div className="panel-subtitle">{audioTracks.length} tracks. Dialogue/narration should be clear; keep music below voices.</div></div><span className="pill">{audioTracks.length} tracks</span></div>
        {audioTracks.length ? <div className="project-list">{audioTracks.map((track) => <article className="project-row" key={track.id}>
          <div className="project-thumb"><Music2 size={18}/></div>
          <div className="project-info"><strong>{track.name}</strong><span>{track.kind} · {track.loop ? "looped" : "single play"}</span>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 8 }}>
              <label className="field-label">Start (s)<input className="field" type="number" min="0" step="0.1" value={track.start_seconds} onChange={(event) => setAudioTracks((current) => current.map((item) => item.id === track.id ? { ...item, start_seconds: Math.max(0, Number(event.target.value)) } : item))}/></label>
              <label className="field-label">Length (s)<input className="field" type="number" min="0.1" step="0.5" value={track.duration_seconds} onChange={(event) => setAudioTracks((current) => current.map((item) => item.id === track.id ? { ...item, duration_seconds: Math.max(0.1, Number(event.target.value)) } : item))}/></label>
              <label className="field-label">Volume · {Math.round(track.volume * 100)}%<input className="field" type="range" min="0" max="2" step="0.05" value={track.volume} onChange={(event) => setAudioTracks((current) => current.map((item) => item.id === track.id ? { ...item, volume: Number(event.target.value) } : item))}/></label>
            </div>
            <label className="field-label" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}><input type="checkbox" checked={track.loop} onChange={(event) => setAudioTracks((current) => current.map((item) => item.id === track.id ? { ...item, loop: event.target.checked } : item))}/>Loop track to fill its duration</label>
          </div>
          <button className="danger-btn" onClick={() => setAudioTracks((current) => current.filter((item) => item.id !== track.id))} aria-label="Remove audio track"><Trash2 size={14}/></button>
        </article>)}</div> : <div className="empty-card"><div className="empty-title">No audio tracks added</div><p className="empty-copy">Add dialogue/narration and a suitable music or ambience track. The renderer blocks silent episode exports.</p></div>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div><div className="panel-title">Render episode master</div><div className="panel-subtitle">FFmpeg renders each segment separately, checkpoints it to Drive, assembles the picture, mixes audio and optionally burns subtitles.</div></div>
          <button className="primary-btn" onClick={() => void queueEpisodeRender()} disabled={busy || !!renderJobId || !clips.length || !audioTracks.length}><Volume2 size={14}/>{busy ? "Saving / queueing…" : "Render final episode"}</button>
        </div>
        {renderJobId && <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-heading"><div><div className="panel-title">Episode render status</div><div className="panel-subtitle">{renderStatus} · {renderProgress}%</div></div><span className="pill">{renderStatus}</span></div>
          <div style={{ height: 7, background: "var(--line)", borderRadius: 99, overflow: "hidden", marginTop: 12 }}><div style={{ width: renderProgress + "%", height: "100%", background: "var(--accent)", transition: "width .25s" }}/></div>
        </div>}
        <p className="muted" style={{ marginTop: 10 }}>Output follows the episode aspect ratio. The current renderer uses hard cuts and center crops; transitions, face-aware vertical reframing and colour grading are future improvements. Still images receive a subtle Ken Burns move. All clips and assets are fetched from this project's connected Google Drive.</p>
        <Link className="text-link" href="/production">Open production queue</Link>
      </section>
    </>}
  </div>;
}
