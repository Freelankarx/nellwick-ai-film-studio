export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { authenticateWorker } from "@/lib/worker-auth";
import { refreshGoogleAccessToken } from "@/lib/google-drive";
export async function GET(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  try { const token = await refreshGoogleAccessToken(worker.ownerId); return NextResponse.json({ access_token: token.accessToken, expires_in: token.expiresIn, root_folder_id: token.rootFolderId }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Drive token refresh failed." }, { status: 409 }); }
}
