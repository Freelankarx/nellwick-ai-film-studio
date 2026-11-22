"use client";

import { useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";

export function UploadMediaButton({ onUploaded }: { onUploaded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setFailed(false);
    setMessage("Preparing Google Drive upload…");
    try {
      const init = await fetch("/api/drive/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size })
      });
      const session = await init.json();
      if (!init.ok) throw new Error(session.error || "Could not start upload.");

      let offset = 0;
      const chunkSize = session.chunk_size || 8 * 1024 * 1024;
      let driveFile: { id?: string; name?: string } | null = null;
      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        setMessage(`Uploading to Drive · ${Math.round((offset / file.size) * 100)}%`);
        const chunk = file.slice(offset, end);
        const response = await fetch(session.upload_url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
            "Content-Type": file.type || "application/octet-stream"
          },
          body: chunk
        });
        if (response.status === 308) {
          let range = response.headers.get("Range");
          if (!range) {
            const probe = await fetch(session.upload_url, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Range": `bytes */${file.size}`,
                "Content-Type": file.type || "application/octet-stream"
              },
              body: new Blob([])
            });
            if (probe.status === 200 || probe.status === 201) {
              driveFile = await probe.json();
              break;
            }
            if (probe.status !== 308) throw new Error(`Could not check Drive upload progress (${probe.status}).`);
            range = probe.headers.get("Range");
          }
          offset = range ? Number(range.split("-").pop()) + 1 : 0;
          if (!range && offset === 0) throw new Error("Drive did not expose its upload offset. Restart the upload and try again.");
          continue;
        }
        if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}). Start the upload again.`);
        driveFile = await response.json();
        offset = end;
      }
      if (!driveFile?.id) throw new Error("Google Drive did not confirm the uploaded file.");

      const registered = await fetch("/api/drive/register-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: driveFile.id, source_type: "uploaded" })
      });
      const result = await registered.json();
      if (!registered.ok) throw new Error(result.error || "Upload completed but media registration failed.");
      setMessage("Upload complete · added to your media library.");
      onUploaded?.();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: "inline-flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
    <label className="primary-btn" style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
      <UploadCloud size={14} />{busy ? "Uploading…" : "Upload media"}
      <input type="file" accept="image/*,video/*,audio/*" hidden disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
        event.currentTarget.value = "";
      }} />
    </label>
    {message && <span className={failed ? "notice" : "muted"} style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5 }}>{failed ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}{message}</span>}
  </div>;
}
