"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Clapperboard,
  Film,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  Layers3,
  LogOut,
  Menu,
  Mic2,
  MonitorPlay,
  Plus,
  Settings2,
  Sparkles,
  Users2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const primary = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/projects", label: "Projects & Episodes", icon: FolderKanban },
  { href: "/director", label: "AI Film Director", icon: Sparkles },
  { href: "/characters", label: "Characters & Worlds", icon: Users2 },
  { href: "/storyboards", label: "Storyboard Studio", icon: Layers3 },
  { href: "/production", label: "Production Queue", icon: Boxes },
];

const create = [
  { href: "/media", label: "Media Library", icon: ImageIcon },
  { href: "/editor", label: "Film Editor", icon: Clapperboard },
  { href: "/shorts", label: "Shorts Studio", icon: MonitorPlay },
  { href: "/audio", label: "Voice & Audio", icon: Mic2 },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (pathname === "/login") return <>{children}</>;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  const renderLinks = (items: typeof primary) =>
    items.map((item) => {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`nav-link ${active ? "active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={16} strokeWidth={1.8} />
          <span>{item.label}</span>
        </Link>
      );
    });

  const allItems = [
    ...primary,
    ...create,
    { href: "/settings", label: "Settings & Connections", icon: Settings2 },
  ];
  const current = allItems.find(
    (item) => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href)),
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setOpen(false)} aria-label="NELLWICK Studio home">
          <div className="brand-mark"><Film size={19} strokeWidth={1.9} /></div>
          <div>
            <div className="brand-name">NELLWICK</div>
            <div className="brand-sub">AI FILM STUDIO</div>
          </div>
        </Link>

        <div>
          <div className="nav-label">WORKSPACE</div>
          <nav className="nav-list" aria-label="Main workspace navigation">{renderLinks(primary)}</nav>
        </div>

        <div>
          <div className="nav-label">CREATIVE TOOLS</div>
          <nav className="nav-list" aria-label="Creative tools navigation">{renderLinks(create)}</nav>
        </div>

        <div className="sidebar-bottom">
          <div className="gpu-card">
            <div className="gpu-title">
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Boxes size={14} /> GPU WORKSPACE
              </span>
              <span className="pill">NOTEBOOK</span>
            </div>
            <div className="gpu-note">
              Kaggle or Colab runs only while its notebook session is active. Open the production queue to review and process jobs.
            </div>
            <Link href="/production" className="text-link" onClick={() => setOpen(false)}>
              View production queue
            </Link>
          </div>
          <nav className="nav-list" aria-label="Studio settings">
            {renderLinks([{ href: "/settings", label: "Settings & Connections", icon: Settings2 }])}
          </nav>
        </div>
      </aside>

      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
              type="button"
            >
              <Menu size={17} />
            </button>
            <div className="breadcrumb">
              STUDIO <span style={{ color: "#69716e", margin: "0 8px" }}>/</span>
              <span style={{ color: "#e0d9ca" }}>{current?.label || "Overview"}</span>
            </div>
          </div>

          <div className="top-actions">
            <Link href="/projects" className="primary-btn topbar-create">
              <Plus size={14} /><span>New project</span>
            </Link>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              title="Sign out of NELLWICK AI Film Studio"
            >
              <LogOut size={14} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
