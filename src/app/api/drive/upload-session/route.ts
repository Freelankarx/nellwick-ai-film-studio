import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { refreshGoogleAccessToken, createDriveFolder } from "@/lib/google-drive";
export async function POST(request: Request) {
  const { user } = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.mimeType !== "string" || !Number.isSafeInteger(body.size) || body.size <= 0) return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  if (body.size > 20 * 1024 * 1024 * 1024) return NextResponse.json({ error: "This upload exceeds the 20 GB studio guardrail." }, { status: 413 });
  try {
    const auth = await refreshGoogleAccessToken(user.id);
    const folderId = await createDriveFolder(auth.accessToken, "Uploads", auth.rootFolderId);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink", { method: "POST", headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": body.mimeType, "X-Upload-Content-Length": String(body.size) }, body: JSON.stringify({ name: body.name.slice(0, 200), mimeType: body.mimeType, parents: [folderId] }), cache: "no-store" });
    if (!response.ok) { const message = await response.text(); throw new Error(message.slice(0, 300)); }
    const location = response.headers.get("Location"); if (!location) throw new Error("Google Drive did not return an upload session URL.");
    return NextResponse.json({ upload_url: location, access_token: auth.accessToken, chunk_size: 8 * 1024 * 1024 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create upload session." }, { status: 409 }); }
}
