"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeading, EmptyState } from "@/components/ui";
import { FileVideo, Image as ImageIcon, Music2, Search, RefreshCw, Tags, ExternalLink, Download, FolderInput, Trash2, RotateCcw } from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";
import { UploadMediaButton } from "@/components/upload-media-button";

type Asset = {
  id: string;
  name: string;
  mime_type: string | null;
  file_size: number | null;
  source_type: string;
  drive_file_id: string | null;
  created_at: string;
  drive_path: string | null;
  project_id: string | null;
  episode_id: string | null;
  is_favorite: boolean;
  tags: string[];
  deleted_at: string | null;
};
type Project = { id: string; name: string };

export default function MediaPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assetResponse, projectResponse] = await Promise.all([
        fetch(filter === "trash" ? "/api/assets?include_trash=true" : "/api/assets", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" })
      ]);
      const [assetData, projectData] = await Promise.all([assetResponse.json(), projectResponse.json()]);
      if (!assetResponse.ok) throw new Error(assetData.error || "Could not load media.");
      setAssets(assetData.assets || []);
      if (projectResponse.ok) setProjects(projectData.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the studio API.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("projectId") || "";
    if (requested) setProjectFilter(requested);
  }, []);

  async function updateAsset(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Media update failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Media update failed.");
    } finally {
      setBusyId("");
    }
  }

  function renameAsset(asset: Asset) {
    const next = window.prompt("Rename media", asset.name);
    if (next && next.trim() && next.trim() !== asset.name) void updateAsset(asset.id, { name: next.trim() });
  }

  function editTags(asset: Asset) {
    const next = window.prompt("Enter tags separated by commas", (asset.tags || []).join(", "));
    if (next !== null) {
      const tags = [...new Set(next.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 30);
      void updateAsset(asset.id, { tags });
    }
  }

  const filtered = useMemo(() => assets.filter((asset) => {
    const typeMatch = filter === "all" || filter === "trash" ||
      (filter === "video" && asset.mime_type?.startsWith("video/")) ||
      (filter === "image" && asset.mime_type?.startsWith("image/")) ||
      (filter === "audio" && asset.mime_type?.startsWith("audio/")) ||
      (filter === "generated" && asset.source_type === "generated") ||
      (filter === "uploaded" && asset.source_type === "uploaded") ||
      (filter === "favorite" && asset.is_favorite);
    const textMatch = `${asset.name} ${(asset.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const projectMatch = !projectFilter || asset.project_id === projectFilter;
    return typeMatch && textMatch && projectMatch && (filter === "trash" ? Boolean(asset.deleted_at) : !asset.deleted_at);
  }), [assets, filter, query, projectFilter]);

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="YOUR CREATIVE ASSETS"
        title="Media library"
        subtitle="Manage uploads, generated footage, voiceovers, images and final exports stored in Google Drive."
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="secondary-btn" onClick={() => void load()}><RefreshCw size={14} />Refresh</button><UploadMediaButton onUploaded={() => void load()} /></div>}
      />
      <div className="toolbar">
        <div className="search-box" style={{ width: 280 }}><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names and tags…" /></div>
        <select className="field" style={{ maxWidth: 190 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All active assets</option><option value="video">Videos</option><option value="image">Images</option><option value="audio">Audio</option><option value="generated">Generated</option><option value="uploaded">Uploaded</option><option value="favorite">Favourites</option><option value="trash">Trash</option>
        </select>
        <select className="field" style={{ maxWidth: 210 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <span className="pill">{filtered.length} assets</span>
      </div>
      {error && <div className="notice" style={{ marginBottom: 14 }}>{error}</div>}
      {loading ? <div className="panel muted">Loading media library…</div> : filtered.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Asset</th><th>Source</th><th>Size</th><th>Added</th><th>Project</th><th>Tags</th><th>Manage</th></tr></thead>
            <tbody>
              {filtered.map((asset) => {
                const driveView = asset.drive_file_id ? `https://drive.google.com/file/d/${encodeURIComponent(asset.drive_file_id)}/view` : null;
                const driveDownload = asset.drive_file_id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(asset.drive_file_id)}` : null;
                return <tr key={asset.id}>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 170 }}>{asset.mime_type?.startsWith("video/") ? <FileVideo size={16} /> : asset.mime_type?.startsWith("audio/") ? <Music2 size={16} /> : <ImageIcon size={16} />}<span style={{ overflowWrap: "anywhere" }}>{asset.name}</span></div><small className="muted">{asset.mime_type || "Unknown type"}</small></td>
                  <td><span className="pill">{asset.source_type}</span></td>
                  <td>{formatBytes(asset.file_size)}</td>
                  <td>{formatDate(asset.created_at)}</td>
                  <td><select className="field" style={{ minWidth: 145, maxWidth: 190 }} value={asset.project_id || ""} disabled={busyId === asset.id || filter === "trash"} onChange={(e) => void updateAsset(asset.id, { project_id: e.target.value || null })}><option value="">Unassigned</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></td>
                  <td><div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 160 }}>{(asset.tags || []).length ? asset.tags.map((tag) => <span className="pill" key={tag}>{tag}</span>) : <span className="muted">—</span>}</div></td>
                  <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {driveView && <a className="secondary-btn" href={driveView} target="_blank" rel="noreferrer" title="Preview in Google Drive"><ExternalLink size={12} />Open</a>}
                    {driveDownload && <a className="secondary-btn" href={driveDownload} target="_blank" rel="noreferrer" title="Download from Google Drive"><Download size={12} /></a>}
                    {filter !== "trash" ? <>
                      <button className="secondary-btn" disabled={busyId === asset.id} onClick={() => renameAsset(asset)}>Rename</button>
                      <button className="secondary-btn" disabled={busyId === asset.id} onClick={() => editTags(asset)}><Tags size={12} />Tags</button>
                      <button className="secondary-btn" disabled={busyId === asset.id} onClick={() => void updateAsset(asset.id, { is_favorite: !asset.is_favorite })}>{asset.is_favorite ? "Unfavourite" : "Favourite"}</button>
                      <button className="danger-btn" disabled={busyId === asset.id} onClick={() => { if (window.confirm("Move this asset to Studio Trash? The original Google Drive file will not be deleted.")) void updateAsset(asset.id, { deleted: true }); }}><Trash2 size={12} />Trash</button>
                    </> : <button className="secondary-btn" disabled={busyId === asset.id} onClick={() => void updateAsset(asset.id, { deleted: false })}><RotateCcw size={12} />Restore</button>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={filter === "trash" ? "Trash is empty" : "Your media library is ready"} copy={filter === "trash" ? "Items you move to Studio Trash will appear here and can be restored." : "Connect Google Drive in Settings, then upload files or run a notebook worker. Generated clips will register here automatically."} href={filter === "trash" ? "/media" : "/settings"} actionLabel={filter === "trash" ? "Back to media" : "Connect Google Drive"} />
      )}
    </div>
  );
}
