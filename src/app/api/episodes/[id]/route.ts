import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const jsonValueSchema: z.ZodType<import("@/types/database").Json> = z.lazy(() =>
  z.union([
    z.string(), z.number(), z.boolean(), z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  synopsis: z.string().max(10000).optional(),
  script_markdown: z.string().max(200000).optional(),
  target_duration_seconds: z.number().int().positive().nullable().optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
  status: z.enum(["draft", "planning", "approved", "queued", "processing", "completed", "archived"]).optional(),
  production_manifest: z.record(z.string(), jsonValueSchema).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid episode update." }, { status: 400 });
  const { data, error } = await supabase.from("episodes").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  return NextResponse.json({ episode: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("episodes").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
