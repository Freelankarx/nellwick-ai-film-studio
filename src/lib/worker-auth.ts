import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/crypto";
export async function authenticateWorker(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("worker_tokens").select("id,owner_id,expires_at,revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  await admin.from("worker_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ownerId: data.owner_id as string, tokenId: data.id as string };
}
