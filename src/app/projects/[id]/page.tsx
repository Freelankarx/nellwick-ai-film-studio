"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Film } from "lucide-react";

interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  aspect_ratio: string;
}

interface EpisodeRecord {
  id: string;
  title: string;
  status: string;
  target_duration_seconds: number | null;
  aspect_ratio: string;
}

interface ProjectDetailResponse {
  project?: ProjectRecord;
  episodes?: EpisodeRecord[];
  error?: string;
}

interface EpisodeCreateResponse {
  episode?: EpisodeRecord;
  error?: string;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [name, setName] = useState("Episode 01");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProject() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          cache: "no-store",
        });

        const data =
          (await response.json()) as ProjectDetailResponse;

        if (!response.ok) {
          throw new Error(data.error || "Could not load project.");
        }

        if (!data.project) {
          throw new Error("Project not found.");
        }

        if (!active) return;

        setProject(data.project);
        setEpisodes(data.episodes ?? []);
      } catch (caught) {
        if (!active) return;

        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load project."
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadProject();

    return () => {
      active = false;
    };
  }, [projectId]);

  async function addEpisode() {
    if (isAdding || !projectId) return;

    setIsAdding(true);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/episodes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: name }),
        }
      );

      const data =
        (await response.json()) as EpisodeCreateResponse;

      if (!response.ok || !data.episode) {
        throw new Error(
          data.error || "Could not create episode."
        );
      }

      const createdEpisode = data.episode;

      setEpisodes((current) => [
        createdEpisode,
        ...current,
      ]);

      setName(
        `Episode ${String(episodes.length + 2).padStart(2, "0")}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create episode."
      );
    } finally {
      setIsAdding(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-wrap">
        <div className="panel">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page-wrap">
        <Link href="/projects" className="text-link">
          <ArrowLeft
            size={13}
            style={{
              display: "inline",
              verticalAlign: "middle",
            }}
          />{" "}
          Back to projects
        </Link>

        <div className="panel" style={{ marginTop: 20 }}>
          {error || "Project not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <Link href="/projects" className="text-link">
        <ArrowLeft
          size={13}
          style={{
            display: "inline",
            verticalAlign: "middle",
          }}
        />{" "}
        Back to projects
      </Link>

      <div className="section-head" style={{ marginTop: 20 }}>
        <div>
          <div className="eyebrow">
            PROJECT WORKSPACE · {project.project_type}
          </div>

          <h1 className="page-title">{project.name}</h1>

          <p className="page-subtitle">
            {project.description ||
              "Your project bible, episodes, characters, storyboards and finished films."}
          </p>
        </div>

        <span className="pill purple">
          {project.aspect_ratio}
        </span>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="panel-title">
              Episodes & productions
            </div>

            <div className="panel-subtitle">
              Each episode has its own shot list, jobs and exports.
            </div>
          </div>

          <button
            className="primary-btn"
            onClick={addEpisode}
            disabled={isAdding}
          >
            <Plus size={14} />
            {isAdding ? "Creating..." : "New episode"}
          </button>
        </div>

        {episodes.length > 0 ? (
          <div className="project-list">
            {episodes.map((episode) => (
              <div className="project-row" key={episode.id}>
                <div className="project-thumb">
                  <Film size={20} />
                </div>

                <div className="project-info">
                  <strong>{episode.title}</strong>

                  <span>
                    {episode.status} ·{" "}
                    {episode.target_duration_seconds
                      ? `${Math.round(
                          episode.target_duration_seconds / 60
                        )} min target`
                      : "Runtime not set"}
                  </span>
                </div>

                <span className="pill">
                  {episode.aspect_ratio}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <div className="empty-icon">
              <Film size={22} />
            </div>

            <div className="empty-title">
              No episodes yet
            </div>

            <p className="empty-copy">
              Create the first episode. Later, each episode will
              contain a story outline, scene breakdown, shot
              manifest and render.
            </p>

            <button
              className="primary-btn"
              onClick={addEpisode}
              disabled={isAdding}
            >
              <Plus size={14} />
              {isAdding ? "Creating..." : "Create first episode"}
            </button>
          </div>
        )}

        {error && (
          <div className="notice" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
