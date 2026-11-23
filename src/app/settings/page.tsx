"use client";

import { useEffect, useState } from "react";
import { PageHeading } from "@/components/ui";
import { Database, HardDrive, Cloud, KeyRound, ShieldCheck, Copy, Check, ExternalLink, RefreshCw } from "lucide-react";

type DriveConnection = { provider: string; account_label: string | null; root_folder_id: string | null; connected_at: string };

export default function SettingsPage() {
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/drive/status", { cache: "no-store" });
      const data = await response.json();
      setDrive(data.connection || null);
      if (!response.ok) setError(data.error || "Could not read Google Drive status.");
      else setError("");
    } catch {
      setError("Could not reach the studio API. Configure Supabase and sign in first.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function createToken() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/worker/token", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create a worker token.");
      setToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard access failed. Select and copy the token manually.");
    }
  }

  async function revokeTokens() {
    if (!window.confirm("Revoke all notebook worker tokens? You will need to create a new token before running Kaggle or Colab.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/worker/token", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not revoke worker tokens.");
      setToken("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token revocation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectDrive() {
    if (!window.confirm("Disconnect Google Drive from this studio? Existing files in Drive will not be deleted.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/drive/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Drive.");
      setDrive(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Drive.");
    } finally {
      setBusy(false);
    }
  }

  const environmentExample = `NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=https://YOUR-VERCEL-DOMAIN
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN/api/drive/callback
TOKEN_ENCRYPTION_KEY=...`;

  return (
    <div className="page-wrap">
      <PageHeading eyebrow="STUDIO CONFIGURATION" title="Settings & connections" subtitle="Connect storage, configure notebook workers and keep credentials out of your source code." />
      <div className="settings-grid">
        <div className="setting-card">
          <div className="setting-icon"><HardDrive size={18} /></div>
          <h3>Google Drive storage</h3>
          <p>Primary home for generated clips, uploaded media and final video exports. Supabase stores file references and metadata.</p>
          {drive ? <>
            <span className="pill green">Connected{drive.account_label ? ` Â· ${drive.account_label}` : ""}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
              <button className="secondary-btn" onClick={() => void load()} disabled={busy}><RefreshCw size={13} />Refresh</button>
              <button className="danger-btn" onClick={() => void disconnectDrive()} disabled={busy}>Disconnect</button>
            </div>
          </> : <a className="primary-btn" href="/api/drive/connect"><ExternalLink size={13} />Connect Google Drive</a>}
        </div>
        <div className="setting-card">
          <div className="setting-icon"><Database size={18} /></div>
          <h3>Supabase database</h3>
          <p>Stores accounts, projects, episodes, characters, production manifests, media metadata and resumable shot-job state.</p>
          <span className="pill">Configure environment variables</span>
        </div>
        <div className="setting-card">
          <div className="setting-icon"><Cloud size={18} /></div>
          <h3>Kaggle & Colab workers</h3>
          <p>Start either notebook when you want to process queued story plans, storyboard shot plans or video jobs. Planning runs on the GPU and does not need Drive; video jobs save generated clips to Drive.</p>
          <button className="secondary-btn" onClick={() => void createToken()} disabled={busy}><KeyRound size={13} />{busy ? "Workingâ€¦" : "Create notebook token"}</button>
          {token && <div style={{ marginTop: 12 }}>
            <div className="notice">Copy this token now. It is displayed only once. Enter it at notebook runtime; never commit it to GitHub.</div>
            <div style={{ display: "flex", gap: 7, marginTop: 8 }}><input className="field" readOnly value={token} /><button className="icon-button" onClick={() => void copyToken()} aria-label="Copy worker token">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
          </div>}
          <button className="danger-btn" style={{ marginTop: 10 }} onClick={() => void revokeTokens()} disabled={busy}>Revoke all worker tokens</button>
        </div>
        <div className="setting-card">
          <div className="setting-icon"><ShieldCheck size={18} /></div>
          <h3>Security & privacy</h3>
          <p>Google refresh tokens are encrypted server-side. Worker tokens are hashed in the database and expire automatically.</p>
          <span className="pill green">Server-side secrets only</span>
        </div>
      </div>
      {error && <div className="notice" style={{ marginTop: 16 }}>{error}</div>}
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">Environment setup</div>
        <div className="panel-subtitle">Set these in your local .env.local and Vercel project settings. Never put secrets in browser code or GitHub.</div>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, lineHeight: 1.8, color: "#b6c0d1", marginTop: 14 }}>{environmentExample}</pre>
      </div>
    </div>
  );
}
