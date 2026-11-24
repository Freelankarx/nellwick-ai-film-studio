"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  Film,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeading, EmptyState } from "@/components/ui";

type Project = {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  aspect_ratio: string;
  created_at: string;
  updated_at: string;
};

const typeLabels: Record<string, string> = {
  film: "Film",
  series: "Series",
  advertisement: "Advertisement",
  documentary: "Documentary",
  social: "Social video",
  other: "Other",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently updated"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("film");
  const [ratio, setRatio] = useState("16:9");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load projects.");
      setProjects(data.projects || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the studio API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesText = !needle || `${project.name} ${project.description || ""} ${typeLabels[project.project_type] || project.project_type}`.toLowerCase().includes(needle);
      const matchesType = typeFilter === "all" || project.project_type === typeFilter;
      return matchesText && matchesType;
    });
  }, [projects, query, typeFilter]);

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), project_type: type, aspect_ratio: ratio }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Project creation failed.");
      setProjects((current) => [data.project, ...current]);
      setModal(false);
      setName("");
      setDescription("");
      router.push(`/projects/${data.project.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project creation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="YOUR PRODUCTION CATALOGUE"
        title="Projects & episodes"
        subtitle="Every film, series, product spot and standalone video has its own organised workspace."
        action={
          <button className="primary-btn" type="button" onClick={() => { setError(""); setModal(true); }}>
            <Plus size={15} /> New project
          </button>
        }
      />

      <section className="project-library-toolbar" aria-label="Project filters">
        <div className="project-library-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects and descriptions"
            aria-label="Search projects"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </div>
        <label className="project-type-filter">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter projects by type">
            <option value="all">All project types</option>
            {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <div className="project-view-switch" role="group" aria-label="Project layout">
          <button className={view === "grid" ? "selected" : ""} type="button" onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"}><LayoutGrid size={15}/></button>
          <button className={view === "list" ? "selected" : ""} type="button" onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"}><List size={15}/></button>
        </div>
        <button className="secondary-btn project-refresh" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""}/> Refresh
        </button>
      </section>

      <div className="project-library-summary">
        <span>{filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"}</span>
        {query || typeFilter !== "all" ? <button type="button" onClick={() => { setQuery(""); setTypeFilter("all"); }}>Clear filters</button> : <span className="muted">Sorted by recently updated</span>}
      </div>

      {error && <div className="notice" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="panel muted project-loading"><RefreshCw size={16} className="spin"/> Loading your projects…</div>
      ) : projects.length === 0 ? (
        <div className="project-empty">
          <div className="project-empty-icon"><FolderOpen size={24}/></div>
          <h2>Your production workspace starts here</h2>
          <p>Create a film, series, documentary, advert or social video. Your screenplay, characters, storyboards, media and production jobs will stay organised inside each project.</p>
          <button className="primary-btn" type="button" onClick={() => setModal(true)}><Plus size={15}/> Create your first project</button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="project-empty compact">
          <div className="project-empty-icon"><Search size={22}/></div>
          <h2>No matching projects</h2>
          <p>Try a different name or remove one of the filters.</p>
          <button className="secondary-btn" type="button" onClick={() => { setQuery(""); setTypeFilter("all"); }}>Clear filters</button>
        </div>
      ) : (
        <div className={view === "grid" ? "project-library-grid" : "project-library-list"}>
          {filteredProjects.map((project) => (
            <Link className="project-library-card" href={`/projects/${project.id}`} key={project.id}>
              <div className="project-library-art">
                <div className="project-art-mark"><Film size={24}/></div>
                <span>{project.aspect_ratio}</span>
              </div>
              <div className="project-library-body">
                <div className="project-library-meta">
                  <span className="project-type-chip">{typeLabels[project.project_type] || project.project_type}</span>
                  <span className="project-updated">Updated {formatDate(project.updated_at)}</span>
                </div>
                <h2>{project.name}</h2>
                <p>{project.description?.trim() || "No project description yet. Open this workspace to add project details and start planning."}</p>
                <div className="project-library-open"><span>Open workspace</span><Clapperboard size={15}/></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(false); }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
            <div className="modal-head">
              <div><div className="eyebrow">NEW WORKSPACE</div><div className="modal-title" id="create-project-title">Create a project</div></div>
              <button className="icon-button" type="button" onClick={() => setModal(false)} disabled={busy} aria-label="Close dialog">×</button>
            </div>
            <form className="form-grid" onSubmit={createProject}>
              <label className="field-label">Project name<input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Things We Never Say" required minLength={2} maxLength={120} autoFocus/></label>
              <label className="field-label">Description<textarea className="field" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you creating?" maxLength={2000}/></label>
              <div className="project-form-pair">
                <label className="field-label">Project type<select className="field" value={type} onChange={(event) => setType(event.target.value)}><option value="film">Film</option><option value="series">Series</option><option value="advertisement">Advertisement</option><option value="documentary">Documentary</option><option value="social">Social video</option><option value="other">Other</option></select></label>
                <label className="field-label">Aspect ratio<select className="field" value={ratio} onChange={(event) => setRatio(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option></select></label>
              </div>
              {error && <div className="notice" role="alert">{error}</div>}
              <div className="project-modal-actions"><button type="button" className="secondary-btn" onClick={() => setModal(false)} disabled={busy}>Cancel</button><button className="primary-btn" disabled={busy || name.trim().length < 2}>{busy ? "Creating workspace…" : "Create project"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
