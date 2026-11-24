"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import { UploadMediaButton } from "@/components/upload-media-button";

type GenerationTarget = {
  type: "character" | "location";
  id: string;
  name: string;
  prompt: string;
};

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
  generationTarget,
  aspectRatio = "1:1",
}: {
  projectId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  description?: string;
  generationTarget?: GenerationTarget;
  aspectRatio?: "1:1" | "16:9" | "9:16";
}) {
  const [assets, setAssets] = useState<ReferenceAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState(generationTarget?.prompt || "");
  const [generateVariants, setGenerateVariants] = useState(1);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [generateError, setGenerateError] = useState("");

  useEffect(() => {
    setGeneratePrompt(generationTarget?.prompt || "");
    setGenerateMessage("");
    setGenerateError("");
  }, [generationTarget?.id, generationTarget?.prompt]);

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

  async function queueGeneration() {
    if (!generationTarget || !projectId || generatePrompt.trim().length < 20) {
      setGenerateError("Add a prompt with at least 20 characters.");
      return;
    }
    setGenerateBusy(true);
    setGenerateError("");
    setGenerateMessage("");
    try {
      const response = await fetch("/api/jobs/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          target: { type: generationTarget.type, id: generationTarget.id },
          prompt: generatePrompt.trim(),
          aspectRatio,
          variants: generateVariants,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue reference generation.");
      setGenerateMessage(`Queued ${data.job?.title || "reference image job"}. Start your Kaggle/Colab worker from Production.`);
      setGenerateOpen(false);
    } catch (caught) {
      setGenerateError(caught instanceof Error ? caught.message : "Could not queue reference generation.");
    } finally {
      setGenerateBusy(false);
    }
  }

  return (
    <section className="reference-picker">
      <div className="reference-picker-heading">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <div className="reference-picker-actions">
          {generationTarget && (
            <button className="secondary-btn reference-generate-trigger" type="button" onClick={() => { setGenerateOpen((open) => !open); setGenerateError(""); }} disabled={!projectId}>
              <ImagePlus size={13}/> Generate with AI
            </button>
          )}
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

      {generateOpen && generationTarget && (
        <div className="reference-generation-panel">
          <div className="reference-generation-title"><strong>Generate a visual reference</strong><span>{generationTarget.type === "character" ? "Character identity sheet" : "Location concept reference"}</span></div>
          <label className="field-label">Generation prompt
            <textarea className="field" rows={5} value={generatePrompt} onChange={(event) => setGeneratePrompt(event.target.value)} maxLength={4000} placeholder="Describe the reference image…"/>
          </label>
          <label className="field-label">Number of variations
            <select className="field" value={generateVariants} onChange={(event) => setGenerateVariants(Number(event.target.value))}>
              <option value={1}>1 image · faster test</option><option value={2}>2 images · compare variations</option>
            </select>
          </label>
          <div className="reference-generation-actions">
            <button className="secondary-btn" type="button" onClick={() => setGenerateOpen(false)} disabled={generateBusy}>Close</button>
            <button className="primary-btn" type="button" onClick={() => void queueGeneration()} disabled={generateBusy || generatePrompt.trim().length < 20}>
              {generateBusy ? "Queueing…" : "Add to production queue"}
            </button>
          </div>
          {generateError && <div className="notice" role="alert">{generateError}</div>}
        </div>
      )}
      {generateMessage && <div className="reference-generation-success"><span>{generateMessage}</span><a href="/production">Open production queue</a></div>}
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
