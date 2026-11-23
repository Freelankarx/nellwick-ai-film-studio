import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export { DRIVE_SCOPE };

function getGoogleOAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Google Drive OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the Vercel Production environment.");
  }

  return { clientId, clientSecret };
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google OAuth token exchange failed.");
  }

  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

export async function refreshGoogleAccessToken(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("encrypted_refresh_token,root_folder_id")
    .eq("owner_id", userId)
    .eq("provider", "google_drive")
    .maybeSingle();

  if (error || !data?.encrypted_refresh_token) {
    throw new Error("Google Drive is not connected. Connect it in Settings.");
  }

  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const refreshToken = decryptSecret(data.encrypted_refresh_token);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const tokens = await response.json();

  if (!response.ok) {
    throw new Error(tokens.error_description || tokens.error || "Google Drive token refresh failed. Reconnect Drive in Settings.");
  }

  return {
    accessToken: tokens.access_token as string,
    expiresIn: tokens.expires_in as number,
    rootFolderId: data.root_folder_id as string,
  };
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Could not create Google Drive folder.");
  }

  return data.id as string;
}

export async function getExistingDriveConnection(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("encrypted_refresh_token,root_folder_id")
    .eq("owner_id", userId)
    .eq("provider", "google_drive")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.encrypted_refresh_token) return null;

  return {
    refreshToken: decryptSecret(data.encrypted_refresh_token),
    rootFolderId: data.root_folder_id as string | null,
  };
}

export async function saveDriveConnection(
  userId: string,
  refreshToken: string,
  rootFolderId: string,
  email?: string
) {
  const admin = createAdminClient();
  const { error } = await admin.from("integrations").upsert(
    {
      owner_id: userId,
      provider: "google_drive",
      encrypted_refresh_token: encryptSecret(refreshToken),
      root_folder_id: rootFolderId,
      account_label: email || null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,provider" }
  );

  if (error) throw new Error(error.message);
}
