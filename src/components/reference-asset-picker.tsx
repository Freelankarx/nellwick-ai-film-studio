"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import { UploadMediaButton } from "@/components/upload-media-button";

type ReferenceAsset = {
  id: string;
  name: string;
  mime_type: string | null;
  drive_file_id: string | null;
  project_id: string | null;
};

function thumbnail(asset: ReferenceAsset) {
  return asset.drive_file_id
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(asset.drive_file_id)}&sz=w360`
    : "";
}

export function ReferenceAssetPicker({
  projectId,
  value,
  onChange,
  title = "Visual references",
  description = "Choose images already in this project's media library or upload new references.",
}: {
  projectId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  description?: string;
}) {
  const [assets, setAssets] = useState<ReferenceAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!projectId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/assets?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load project images.");
      setAssets((data.assets || []).filter((asset: ReferenceAsset) => asset.mime_type?.startsWith("image/")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load reference images.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id].slice(0, 100));
  }

  return (
    <section className="reference-picker">
      <div className="reference-picker-heading">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <div className="reference-picker-actions">
          <UploadMediaButton
            projectId={projectId}
            accept="image/*"
            buttonLabel="Upload image"
            onUploaded={(asset) => {
              setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
              onChange([...value, asset.id].slice(0, 100));
            }}
          />
          <button className="icon-button" type="button" onClick={() => void load()} disabled={loading || !projectId} aria-label="Refresh reference images">
            <RefreshCw size={14} className={loading ? "spin" : ""}/>
          </button>
        </div>
      </div>

      {!projectId ? <p className="reference-picker-empty">Select a project to manage its reference images.</p> : loading && assets.length === 0 ? (
        <p className="reference-picker-empty"><LoaderCircle size={14} className="spin"/> Loading project images…</p>
      ) : assets.length === 0 ? (
        <p className="reference-picker-empty"><ImagePlus size={16}/> No project images yet. Upload a character sheet, portrait or location reference.</p>
      ) : (
        <div className="reference-asset-grid">
          {assets.map((asset) => {
            const selected = value.includes(asset.id);
            const src = thumbnail(asset);
            return (
              <button
                key={asset.id}
                type="button"
                className={`reference-asset ${selected ? "selected" : ""}`}
                onClick={() => toggle(asset.id)}
                aria-pressed={selected}
                title={selected ? `Remove ${asset.name} from references` : `Use ${asset.name} as a reference`}
              >
                <div className="reference-asset-preview">
                  {src ? <img src={src} alt={asset.name} loading="lazy" onError={(event) => { event.currentTarget.style.opacity = "0"; }} /> : <ImagePlus size={20}/>}
                  {selected && <span className="reference-selected-check"><Check size={13}/></span>}
                </div>
                <span>{asset.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <div className="notice" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div className="reference-picker-footer">{value.length} selected · Select multiple images to build a reusable reference set.</div>
    </section>
  );
}
