import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getAppBaseUrl, getGoogleRedirectUri, hasValidTokenEncryptionKey } from "@/lib/app-url";
import { DRIVE_SCOPE } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appBaseUrl = getAppBaseUrl(request.url);
  const { user } = await requireUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", appBaseUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings?drive=missing_google_config", appBaseUrl));
  }

  if (!hasValidTokenEncryptionKey()) {
    return NextResponse.redirect(new URL("/settings?drive=missing_encryption_key", appBaseUrl));
  }

  let redirectUri: string;
  try {
    redirectUri = getGoogleRedirectUri(request.url);
  } catch {
    return NextResponse.redirect(new URL("/settings?drive=invalid_google_redirect", appBaseUrl));
  }

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("drive_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", `openid email ${DRIVE_SCOPE}`);
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizationUrl);
}
