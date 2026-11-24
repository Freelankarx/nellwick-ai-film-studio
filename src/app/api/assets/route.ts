import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to view media." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const includeTrash = params.get("include_trash") === "true";
  const projectId = params.get("projectId");
  let query = supabase.from("assets")
    .select("id,name,mime_type,file_size,source_type,drive_file_id,drive_path,created_at,project_id,episode_id,is_favorite,tags,deleted_at,metadata")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!includeTrash) query = query.is("deleted_at", null);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data || [] }, { headers: { "Cache-Control": "no-store" } });
}
