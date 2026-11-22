import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
const schema = z.object({ title: z.string().trim().min(2).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an episode title." }, { status: 400 });
  const { data: project } = await supabase.from("projects").select("id,aspect_ratio").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data, error } = await supabase.from("episodes").insert({ owner_id: user.id, project_id: id, title: parsed.data.title, aspect_ratio: project.aspect_ratio, status: "draft" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ episode: data }, { status: 201 });
}
