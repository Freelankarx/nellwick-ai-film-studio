"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading, EmptyState } from "@/components/ui";
import { RefreshCw } from "lucide-react";

type Job = {
  id: string;
  title: string;
  status: string;
  progress: number;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
  lease_expires_at: string | null;
};

export default function ProductionPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingOn, setActingOn] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load jobs.");
      setJobs(data.jobs || []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load jobs.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function retry(id: string) {
    setActingOn(id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Retry failed.");
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry failed.");
    } finally {
      setActingOn("");
    }
  }

  async function cancel(id: string) {
    setActingOn(id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not cancel job.");
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel job.");
    } finally {
      setActingOn("");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(false), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="JOB ORCHESTRATION"
        title="Production queue"
        subtitle="Queue multiple generation jobs, process them on Kaggle or Colab, and resume interrupted work."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary-btn" onClick={() => void load()}><RefreshCw size={14} />Refresh</button>
            <Link className="primary-btn" href="/production/new">New shot job</Link>
          </div>
        }
      />
      <div className="notice" style={{ marginBottom: 18 }}>
        A notebook worker is not an always-on server. Start the Colab or Kaggle notebook when you are ready to process queued jobs. Completed shots are checkpointed so another session can continue later. You can queue other available shots while a different job is processing.
      </div>
      {error && <div className="notice" style={{ marginBottom: 14 }}>{error}</div>}
      {loading ? <div className="panel muted">Loading queue…</div> : jobs.length ? (
        <div className="panel">
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data-table">
              <thead><tr><th>Production job</th><th>Status</th><th>Progress</th><th>Attempts</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {jobs.map((job) => {
                  const waitingForWorker = job.status === "cancelled" && !!job.lease_expires_at && new Date(job.lease_expires_at).getTime() > Date.now();
                  const isActing = actingOn === job.id;
                  return (
                    <tr key={job.id}>
                      <td>
                        <b>{job.title}</b>
                        {job.last_error && <div style={{ color: "#e7a2a8", marginTop: 5 }}>{job.last_error}</div>}
                        {waitingForWorker && <div className="muted" style={{ marginTop: 5 }}>Waiting for the notebook worker to stop safely…</div>}
                      </td>
                      <td><span className={`pill ${job.status === "completed" ? "green" : job.status === "processing" ? "purple" : ""}`}>{job.status}</span></td>
                      <td style={{ minWidth: 140 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="progress" style={{ width: 85 }}><span style={{ width: `${job.progress || 0}%` }} /></div>
                          <span>{job.progress || 0}%</span>
                        </div>
                      </td>
                      <td>{job.attempt_count}</td>
                      <td>{new Date(job.created_at).toLocaleString()}</td>
                      <td>
                        {job.status === "queued" || job.status === "processing" ? (
                          <button className="danger-btn" onClick={() => void cancel(job.id)} disabled={isActing}>
                            {isActing ? "Stopping…" : job.status === "processing" ? "Stop job" : "Cancel"}
                          </button>
                        ) : job.status === "failed" || job.status === "cancelled" ? (
                          <button className="secondary-btn" onClick={() => void retry(job.id)} disabled={isActing || waitingForWorker}>
                            {isActing ? "Retrying…" : waitingForWorker ? "Stopping…" : "Retry"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState title="No production jobs yet" copy="Create a project, then submit a shot to the production queue. Your notebook worker will claim it and report progress." href="/projects" actionLabel="Open projects" />
      )}
    </div>
  );
}
