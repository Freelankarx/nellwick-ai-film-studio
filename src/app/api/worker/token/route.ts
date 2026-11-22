import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { newOpaqueToken, hashToken } from "@/lib/crypto";
export async function POST() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const admin = createAdminClient();
  const token = newOpaqueToken();
  const { error } = await admin.from("worker_tokens").insert({ owner_id: user.id, token_hash: hashToken(token), label: "Notebook worker", expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token, expires_in_days: 30 }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin.from("worker_tokens").update({ revoked_at: new Date().toISOString() }).eq("owner_id", user.id).is("revoked_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
