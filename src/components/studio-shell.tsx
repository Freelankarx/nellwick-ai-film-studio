"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, BookOpen, Boxes, Clapperboard, Film, FolderKanban, Gauge, HardDrive, Image, Layers3, Menu, Mic2, MonitorPlay, Search, Settings2, Sparkles, Users2, X } from "lucide-react";
const primary = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/projects", label: "Projects & Episodes", icon: FolderKanban },
  { href: "/director", label: "AI Film Director", icon: Sparkles },
  { href: "/characters", label: "Characters & Worlds", icon: Users2 },
  { href: "/storyboards", label: "Storyboard Studio", icon: Layers3 },
  { href: "/production", label: "Production Queue", icon: Activity }
];
const create = [
  { href: "/media", label: "Media Library", icon: Image },
  { href: "/editor", label: "Film Editor", icon: Clapperboard },
  { href: "/shorts", label: "Shorts Studio", icon: MonitorPlay },
  { href: "/audio", label: "Voice & Audio", icon: Mic2 }
];
export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/login") return <>{children}</>;
  const renderLinks = (items: typeof primary) => items.map(item => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`nav-link ${active ? "active" : ""}`}><Icon size={16}/><span>{item.label}</span></Link>;
  });
  const current = [...primary, ...create, { href: "/settings", label: "Settings", icon: Settings2 }].find(item => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href)));
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Film size={20}/></div><div><div className="brand-name">NELLWICK</div><div className="brand-sub">AI FILM STUDIO</div></div></div>
      <div><div className="nav-label">WORKSPACE</div><nav className="nav-list">{renderLinks(primary)}</nav></div>
      <div><div className="nav-label">CREATIVE TOOLS</div><nav className="nav-list">{renderLinks(create)}</nav></div>
      <div className="sidebar-bottom">
        <div className="gpu-card"><div className="gpu-title"><span style={{display:"flex",alignItems:"center",gap:7}}><Boxes size={14}/> Worker status</span><span className="pill">Standby</span></div><div className="gpu-note">Start a Colab or Kaggle notebook to process queued shots. Your studio stays available here.</div></div>
        <nav className="nav-list">{renderLinks([{ href: "/settings", label: "Settings & Connections", icon: Settings2 }])}</nav>
      </div>
    </aside>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
    <main className="main-area">
      <header className="topbar">
        <div style={{display:"flex",alignItems:"center",gap:12}}><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={17}/></button><div className="breadcrumb">STUDIO <span style={{color:"#566176",margin:"0 8px"}}>/</span> <span style={{color:"#d7dced"}}>{current?.label || "Overview"}</span></div></div>
        <div className="top-actions"><div className="search-box"><Search size={14}/><input placeholder="Search your studio" aria-label="Search your studio"/><span style={{fontSize:9,border:"1px solid var(--line)",borderRadius:4,padding:"2px 4px"}}>⌘ K</span></div><button className="icon-button" aria-label="Notifications"><Bell size={15}/></button><div className="avatar">N</div></div>
      </header>
      {children}
    </main>
  </div>;
}
