import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const characterSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  role: z.string().max(120).optional().default(""),
  canonical_description: z.string().max(5000).optional().default(""),
  visual_traits: z.record(z.string(), z.string()).optional().default({}),
  wardrobe: z.array(z.string().trim().min(1).max(160)).max(30).optional().default([]),
  voice_profile: z.record(z.string(), z.string()).optional().default({}),
  reference_asset_ids: z.array(z.string().uuid()).max(100).optional().default([]),
  continuity_notes: z.string().max(4000).optional().default(""),
});

async function validateReferenceAssets(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  ownerId: string,
  projectId: string,
  assetIds: string[],
) {
  const ids = [...new Set(assetIds)];
  if (ids.length !== assetIds.length) return "Reference images contain duplicate selections.";
  if (!ids.length) return null;
  const { data, error } = await supabase.from("assets")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .like("mime_type", "image/%")
    .in("id", ids);
  if (error) return error.message;
  return (data || []).length === ids.length ? null : "Every reference must be an active image in this project.";
}

export async function GET(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  let query = supabase.from("characters").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = characterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid character.", details: parsed.error.issues }, { status: 400 });
  const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const referenceError = await validateReferenceAssets(supabase, user.id, project.id, parsed.data.reference_asset_ids);
  if (referenceError) return NextResponse.json({ error: referenceError }, { status: 400 });
  const { data, error } = await supabase.from("characters").insert({ ...parsed.data, owner_id: user.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data }, { status: 201 });
}
