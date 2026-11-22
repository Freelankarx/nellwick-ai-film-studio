import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { projectSchema } from "@/lib/validators";
export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to view projects." }, { status: 401 });
  const { data, error } = await supabase.from("projects").select("id,name,description,project_type,aspect_ratio,created_at,updated_at").eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data || [] }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to create a project." }, { status: 401 });
  const parsed = projectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid project details." }, { status: 400 });
  const { data, error } = await supabase.from("projects").insert({ ...parsed.data, owner_id: user.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
