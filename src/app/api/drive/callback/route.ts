import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { exchangeGoogleCode, getExistingDriveConnection, createDriveFolder, saveDriveConnection } from "@/lib/google-drive";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const cookieStore = await cookies(); const expectedState = cookieStore.get("drive_oauth_state")?.value; cookieStore.delete("drive_oauth_state");
  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  if (!state || !expectedState || state !== expectedState) return NextResponse.redirect(new URL("/settings?drive=state_error", base));
  if (url.searchParams.get("error")) return NextResponse.redirect(new URL("/settings?drive=denied", base));
  const { user } = await requireUser(); if (!user || !code) return NextResponse.redirect(new URL("/login", base));
  try {
    const tokens = await exchangeGoogleCode(code);
    const existing = await getExistingDriveConnection(user.id);
    const refreshToken = tokens.refresh_token || existing?.refreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Disconnect the app in your Google Account, then connect again.");
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};
    const rootFolderId = existing?.rootFolderId || await createDriveFolder(tokens.access_token, "NELLWICK AI FILM STUDIO");
    await saveDriveConnection(user.id, refreshToken, rootFolderId, userInfo.email);
    return NextResponse.redirect(new URL("/settings?drive=connected", base));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive connection failed.";
    return NextResponse.redirect(new URL(`/settings?drive=error&message=${encodeURIComponent(message.slice(0,180))}`, base));
  }
}
