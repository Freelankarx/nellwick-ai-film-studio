import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const locationSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional().default(""),
  continuity_notes: z.string().max(4000).optional().default(""),
});

export async function GET(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  let query = supabase.from("locations").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = locationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid location." }, { status: 400 });
  const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data, error } = await supabase.from("locations").insert({ ...parsed.data, owner_id: user.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data }, { status: 201 });
}
