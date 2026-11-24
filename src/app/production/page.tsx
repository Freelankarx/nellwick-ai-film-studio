"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeading, EmptyState } from "@/components/ui";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";

type Job = {
  id: string;
  title: string;
  status: string;
  progress: number;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
  lease_expires_at: string | null;
  project_id: string | null;
  episode_id: string | null;
};

const statuses = [
  { value: "all", label: "All jobs" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function readableDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingOn, setActingOn] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async (showLoading = true) => {
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
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(false), 7000);
    return () => window.clearInterval(timer);
  }, [load]);

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

  const counts = useMemo(() => ({
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    processing: jobs.filter((job) => job.status === "processing").length,
    completed: jobs.filter((job) => job.status === "completed").length,
    attention: jobs.filter((job) => job.status === "failed" || job.status === "cancelled").length,
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = filter === "all" || job.status === filter;
      const matchesText = !needle || `${job.title} ${job.last_error || ""}`.toLowerCase().includes(needle);
      return matchesStatus && matchesText;
    });
  }, [jobs, query, filter]);

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="JOB ORCHESTRATION"
        title="Production queue"
        subtitle="Monitor each shot-generation batch, recover failed work and keep track of jobs across notebook sessions."
        action={<div className="production-header-actions"><button className="secondary-btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""}/> Refresh</button><Link className="primary-btn" href="/production/new"><PlayCircle size={14}/> New shot job</Link></div>}
      />

      <div className="production-session-note">
        <div className="production-session-icon"><PauseCircle size={18}/></div>
        <div><strong>Notebook processing is session-based</strong><p>Start Kaggle or Colab when you're ready to process queued work. Completed shots are checkpointed to Drive, so you can continue in another session. This page refreshes job status automatically.</p></div>
      </div>

      {error && <div className="notice" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <section className="production-stats" aria-label="Production job summary">
        <div className="production-stat"><span>Total jobs</span><strong>{counts.total.toString().padStart(2, "0")}</strong><small>Recent jobs in this queue</small></div>
        <div className="production-stat"><span>Queued</span><strong>{counts.queued.toString().padStart(2, "0")}</strong><small>Waiting for a worker</small></div>
        <div className="production-stat"><span>Processing</span><strong>{counts.processing.toString().padStart(2, "0")}</strong><small>Currently being processed</small></div>
        <div className="production-stat"><span>Completed</span><strong>{counts.completed.toString().padStart(2, "0")}</strong><small>Finished successfully</small></div>
        <div className="production-stat attention"><span>Needs attention</span><strong>{counts.attention.toString().padStart(2, "0")}</strong><small>Failed or cancelled</small></div>
      </section>

      <section className="production-list-panel">
        <div className="production-list-heading">
          <div><h2>Generation jobs</h2><p>Up to 100 most recent jobs. Status updates automatically.</p></div>
          <span className="production-live-indicator"><span/> Auto-refresh on</span>
        </div>
        <div className="production-filters">
          <div className="production-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs or errors" aria-label="Search production jobs"/></div>
          <label className="production-status-filter"><span>Status</span><select className="field" value={filter} onChange={(event) => setFilter(event.target.value)}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <span className="production-result-count">{filteredJobs.length} shown</span>
        </div>

        {loading ? (
          <div className="production-empty"><RefreshCw size={18} className="spin"/> Loading production jobs…</div>
        ) : filteredJobs.length === 0 ? (
          jobs.length === 0 ? (
            <EmptyState title="Your production queue is clear" copy="Create a project and submit a shot sequence. The Kaggle or Colab worker will claim queued jobs when its notebook session is running." href="/projects" actionLabel="Open projects"/>
          ) : (
            <div className="production-empty"><Search size={18}/><strong>No jobs match this filter</strong><span>Clear the search or choose another status.</span><button type="button" className="secondary-btn" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div>
          )
        ) : (
          <div className="production-job-list">
            {filteredJobs.map((job) => {
              const waitingForWorker = job.status === "cancelled" && !!job.lease_expires_at && new Date(job.lease_expires_at).getTime() > Date.now();
              const isActing = actingOn === job.id;
              const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
              const completed = job.status === "completed";
              const failed = job.status === "failed";
              const processing = job.status === "processing";
              return (
                <article className="production-job" key={job.id}>
                  <div className="production-job-icon">{completed ? <CheckCircle2/> : failed ? <AlertCircle/> : processing ? <LoaderCircle className="production-pulse"/> : job.status === "cancelled" ? <XCircle/> : <Clock3/>}</div>
                  <div className="production-job-main">
                    <div className="production-job-title-row"><h3>{job.title}</h3><span className={`production-status status-${job.status}`}>{job.status}</span></div>
                    <div className="production-job-meta"><span>{readableDate(job.created_at)}</span><span>Attempt {job.attempt_count}</span>{job.project_id && <Link href={`/projects/${job.project_id}`}>Open project</Link>}</div>
                    {(job.last_error || waitingForWorker) && <p className={`production-job-message ${failed ? "is-error" : ""}`}>{waitingForWorker ? "Cancellation requested — waiting for the notebook worker to stop safely." : job.last_error}</p>}
                    <div className="production-progress-row"><div className="production-progress-track"><span className={completed ? "is-complete" : ""} style={{ width: `${progress}%` }}/></div><span>{progress}%</span></div>
                  </div>
                  <div className="production-job-actions">
                    {job.status === "queued" || processing ? (
                      <button type="button" className="danger-btn" onClick={() => void cancel(job.id)} disabled={isActing}>{isActing ? "Stopping…" : processing ? "Stop job" : "Cancel"}</button>
                    ) : failed || job.status === "cancelled" ? (
                      <button type="button" className="secondary-btn" onClick={() => void retry(job.id)} disabled={isActing || waitingForWorker}><RotateCcw size={13}/>{isActing ? "Retrying…" : waitingForWorker ? "Stopping…" : "Retry"}</button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
