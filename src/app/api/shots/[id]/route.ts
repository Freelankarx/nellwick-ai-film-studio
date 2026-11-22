import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  prompt: z.string().max(4000).optional(),
  negative_prompt: z.string().max(2000).optional(),
  action_description: z.string().max(2000).optional(),
  duration_seconds: z.number().positive().max(60).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
  model_id: z.string().trim().min(1).max(120).optional(),
  generation_mode: z.enum(["text_to_video", "image_to_video", "image_generation"]).optional(),
  status: z.enum(["draft", "approved", "queued", "processing", "completed", "failed"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid shot update." }, { status: 400 });
  const { data, error } = await supabase.from("shots").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Shot not found." }, { status: 404 });
  return NextResponse.json({ shot: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: shot } = await supabase.from("shots").select("id,status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!shot) return NextResponse.json({ error: "Shot not found." }, { status: 404 });
  if (shot.status === "queued" || shot.status === "processing") return NextResponse.json({ error: "A queued or processing shot cannot be deleted." }, { status: 409 });
  const { error } = await supabase.from("shots").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
