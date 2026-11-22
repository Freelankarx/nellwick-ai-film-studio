"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Music2, RefreshCw } from "lucide-react";
import { PageHeading, EmptyState } from "@/components/ui";
import { UploadMediaButton } from "@/components/upload-media-button";
import { formatBytes, formatDate } from "@/lib/utils";
type AudioAsset = { id: string; name: string; mime_type: string | null; file_size: number | null; drive_file_id: string | null; created_at: string; source_type: string };
export default function AudioPage() {
  const [assets, setAssets] = useState<AudioAsset[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/assets", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load audio assets."); setAssets((data.assets || []).filter((asset: AudioAsset) => asset.mime_type?.startsWith("audio/"))); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load audio library."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="page-wrap"><PageHeading eyebrow="SOUND LIBRARY" title="Voice & audio" subtitle="Manage dialogue recordings, narration, music and sound effects uploaded to your connected Google Drive." action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="secondary-btn" onClick={() => void load()}><RefreshCw size={14}/>Refresh</button><UploadMediaButton onUploaded={() => void load()}/></div>}/>
    <div className="notice" style={{ marginBottom: 16 }}>Audio asset management is available. Speech synthesis, voice cloning and audio mixing are not connected yet.</div>{error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
    {loading ? <div className="panel muted">Loading audio library…</div> : assets.length ? <div className="project-list">{assets.map((asset) => <div className="project-row" key={asset.id}><div className="project-thumb"><Music2 size={20}/></div><div className="project-info"><strong>{asset.name}</strong><span>{asset.mime_type || "Audio"} · {formatBytes(asset.file_size)} · {formatDate(asset.created_at)}</span></div><span className="pill">{asset.source_type}</span>{asset.drive_file_id && <><a className="secondary-btn" target="_blank" rel="noreferrer" href={`https://drive.google.com/file/d/${encodeURIComponent(asset.drive_file_id)}/view`}><ExternalLink size={13}/>Preview</a><a className="secondary-btn" target="_blank" rel="noreferrer" href={`https://drive.google.com/uc?export=download&id=${encodeURIComponent(asset.drive_file_id)}`}><Download size={13}/>Download</a></>}</div>)}</div> : <EmptyState title="No audio files yet" copy="Upload narration, dialogue, music or sound effects. Files appear here after they are registered in the media library." href="/media" actionLabel="Open media library"/>}
    <div className="panel" style={{ marginTop: 18 }}><div className="panel-title">Audio workflow</div><p className="panel-subtitle" style={{ marginTop: 8 }}>Keep original recordings in Media Library and use tags to organize dialogue, voiceover, music and sound effects.</p><Link className="text-link" href="/media">Manage all media</Link></div>
  </div>;
}
