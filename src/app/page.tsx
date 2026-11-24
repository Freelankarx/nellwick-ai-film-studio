"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, ArrowUpRight, Clapperboard, Clock3, Film, FolderKanban, HardDrive, Image, Plus, Sparkles, Video, WandSparkles } from "lucide-react";
import { PageHeading } from "@/components/ui";
type Project = { id: string; name: string; project_type: string; updated_at: string; aspect_ratio: string };
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  useEffect(() => {
    Promise.all([fetch("/api/projects").then(r=>r.ok?r.json():{projects:[]}),fetch("/api/jobs").then(r=>r.ok?r.json():{jobs:[]}),fetch("/api/assets").then(r=>r.ok?r.json():{assets:[]})]).then(([p,j,a])=>{setProjects(p.projects||[]);setJobCount((j.jobs||[]).length);setAssetCount((a.assets||[]).length);}).catch(()=>{});
  },[]);
  return <div className="page-wrap">
    <div className="dashboard-hero"><PageHeading eyebrow="YOUR CREATIVE COMMAND CENTER" title="Make something unforgettable." subtitle="Develop your story, direct each shot and bring the pieces together in one creative workspace." action={<Link className="primary-btn" href="/projects"><Plus size={15}/>New project</Link>}/></div>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-top"><span>Active projects</span><span className="stat-icon"><FolderKanban size={15}/></span></div><div className="stat-value">{projects.length.toString().padStart(2,"0")}</div><div className="stat-caption">Across your creative workspace</div></div>
      <div className="stat-card"><div className="stat-top"><span>Production jobs</span><span className="stat-icon"><Activity size={15}/></span></div><div className="stat-value">{jobCount.toString().padStart(2,"0")}</div><div className="stat-caption">Queued, running and completed</div></div>
      <div className="stat-card"><div className="stat-top"><span>Media assets</span><span className="stat-icon"><Image size={15}/></span></div><div className="stat-value">{assetCount.toString().padStart(2,"0")}</div><div className="stat-caption">Registered in your library</div></div>
      <div className="stat-card"><div className="stat-top"><span>Storage connection</span><span className="stat-icon"><HardDrive size={15}/></span></div><div className="stat-value" style={{fontSize:20,marginTop:18}}>Google Drive</div><div className="stat-caption">Manage your storage connection in Settings</div></div>
    </div>
    <div className="content-grid">
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">Recent projects</div><div className="panel-subtitle">Pick up where your last production left off.</div></div><Link className="text-link" href="/projects">View all <ArrowUpRight size={12} style={{display:"inline",verticalAlign:"middle"}}/></Link></div>
        {projects.length ? <div className="project-list">{projects.slice(0,4).map(p=><Link className="project-row" href={`/projects/${p.id}`} key={p.id}><div className="project-thumb"><Film size={22}/></div><div className="project-info"><strong>{p.name}</strong><span>{p.project_type} · {p.aspect_ratio} · Updated {new Date(p.updated_at).toLocaleDateString()}</span></div><span className="pill purple">Open project</span></Link>)}</div> : <div className="empty-card"><div className="empty-icon"><Clapperboard size={22}/></div><div className="empty-title">Your first film starts here</div><p className="empty-copy">Create a project for a film, series, advert or any other video. Your story assets and productions will live inside it.</p><Link href="/projects" className="primary-btn"><Plus size={14}/>Create your first project</Link></div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="panel-title">Production workflow</div><div className="panel-subtitle">The path from idea to finished film.</div></div><span className="pill green">Resumable</span></div><div className="activity-list">{[{n:"01",t:"Build your story",d:"Project, script, characters and visual direction."},{n:"02",t:"Plan the shots",d:"Break scenes into small, independently generated clips."},{n:"03",t:"Run a GPU worker",d:"Start a Kaggle or Colab notebook to process the queue."},{n:"04",t:"Review and organise",d:"Completed clips are saved to Drive; full timeline rendering is a separate editor upgrade."}].map(x=><div className="activity-item" key={x.n}><div className="activity-dot"/><div className="activity-copy"><b>{x.n} · {x.t}</b><small>{x.d}</small></div></div>)}</div></section>
    </div>
    <div className="quick-grid"><Link href="/director" className="quick-card"><span className="quick-icon"><Sparkles size={17}/></span><span><b>Open AI Film Director</b><small>Develop a story and production plan</small></span><ArrowRight size={14} style={{marginLeft:"auto",color:"#8995aa"}}/></Link><Link href="/production" className="quick-card"><span className="quick-icon"><Video size={17}/></span><span><b>Production queue</b><small>Review jobs and worker progress</small></span><ArrowRight size={14} style={{marginLeft:"auto",color:"#8995aa"}}/></Link><Link href="/media" className="quick-card"><span className="quick-icon"><Image size={17}/></span><span><b>Manage media</b><small>Uploads, generated clips and exports</small></span><ArrowRight size={14} style={{marginLeft:"auto",color:"#8995aa"}}/></Link></div>
    <div style={{marginTop:18}} className="notice">Free-GPU reality check: Kaggle and Colab sessions are temporary and GPU availability is not guaranteed. This studio saves job state between sessions; it does not claim to provide an always-on free GPU.</div>
  </div>;
}
