import Link from "next/link";
import { ArrowUpRight, Film, Plus, Sparkles } from "lucide-react";
export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="section-head"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}
export function EmptyState({ title, copy, href, actionLabel }: { title: string; copy: string; href?: string; actionLabel?: string }) {
  return <div className="empty-card"><div className="empty-icon"><Film size={22}/></div><div className="empty-title">{title}</div><p className="empty-copy">{copy}</p>{href && <Link className="primary-btn" href={href}><Plus size={14}/>{actionLabel || "Get started"}</Link>}</div>;
}
export function ComingSoon({ title, description, items }: { title: string; description: string; items: string[] }) {
  return <div className="page-wrap"><PageHeading eyebrow="CREATIVE WORKSPACE" title={title} subtitle={description}/><div className="panel" style={{maxWidth:850}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}><div className="setting-icon"><Sparkles size={18}/></div><div><div className="panel-title">Module foundation</div><div className="panel-subtitle">The route and product area are reserved in the architecture.</div></div></div><div className="notice">This module is scaffolded for the next implementation phase. It is not presented as a finished editor or generation model.</div><div style={{display:"grid",gap:11,marginTop:20}}>{items.map(item=><div key={item} style={{display:"flex",gap:10,alignItems:"center",fontSize:11,color:"#ced6e4"}}><span style={{color:"#9c91ff"}}>✦</span>{item}</div>)}</div></div></div>;
}
