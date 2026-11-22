import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data: episodes } = await supabase.from("episodes").select("*").eq("project_id", id).eq("owner_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ project, episodes: episodes || [] }, { headers: { "Cache-Control": "no-store" } });
}
