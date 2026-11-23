/**
 * Resolve the public Studio origin consistently in OAuth routes.
 * In production, never redirect a visitor to localhost just because an
 * environment variable was omitted or left with its local-development value.
 */
export function getAppBaseUrl(requestUrl: string): string {
  const requestOrigin = new URL(requestUrl).origin;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) return requestOrigin;

  try {
    const parsed = new URL(configured);
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    if (process.env.NODE_ENV === "production" && (isLocalHost || parsed.protocol !== "https:")) {
      return requestOrigin;
    }

    return parsed.origin;
  } catch {
    return requestOrigin;
  }
}

/**
 * Must match the redirect URI registered on the Google OAuth Web client.
 * Connect and callback both call this helper so the value cannot drift.
 */
export function getGoogleRedirectUri(requestUrl: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  const redirectUri = configured
    ? new URL(configured)
    : new URL("/api/drive/callback", getAppBaseUrl(requestUrl));

  if (redirectUri.pathname !== "/api/drive/callback") {
    throw new Error("GOOGLE_REDIRECT_URI must end with /api/drive/callback.");
  }

  if (process.env.NODE_ENV === "production" && redirectUri.protocol !== "https:") {
    throw new Error("GOOGLE_REDIRECT_URI must use HTTPS in production.");
  }

  return redirectUri.toString();
}

export function hasValidTokenEncryptionKey(): boolean {
  return /^[a-fA-F0-9]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY?.trim() || "");
}
