import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshGoogleAccessToken } from "@/lib/google-drive";
const schema = z.object({ file_id: z.string().min(5), project_id: z.string().uuid().optional(), source_type: z.enum(["uploaded","generated","rendered"]).default("uploaded") });
export async function POST(request: Request) {
  const { user } = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid Drive file reference." }, { status: 400 });
  try {
    const auth = await refreshGoogleAccessToken(user.id);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.data.file_id)}?fields=id,name,mimeType,size,parents,webViewLink`, { headers: { Authorization: `Bearer ${auth.accessToken}` }, cache: "no-store" });
    const file = await response.json(); if (!response.ok) throw new Error(file.error?.message || "Could not verify Drive file.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("assets").insert({ owner_id: user.id, project_id: parsed.data.project_id || null, name: file.name, mime_type: file.mimeType, file_size: Number(file.size || 0), source_type: parsed.data.source_type, storage_provider: "google_drive", drive_file_id: file.id, drive_path: "NELLWICK AI FILM STUDIO/Uploads", metadata: { webViewLink: file.webViewLink || null } }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not register uploaded media." }, { status: 409 }); }
}
