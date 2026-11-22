import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { DRIVE_SCOPE } from "@/lib/google-drive";
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/settings?drive=missing_google_config", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("drive_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/drive/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID); url.searchParams.set("redirect_uri", redirectUri); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", `openid email ${DRIVE_SCOPE}`); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); url.searchParams.set("include_granted_scopes", "true"); url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
