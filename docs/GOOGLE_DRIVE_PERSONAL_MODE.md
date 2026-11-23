# NELLWICK Google Drive — Personal mode setup

This setup connects the Google Account that owns the Google Auth Platform Personal mode OAuth application. Personal mode is intended for the Studio owner's own Google Account; it is not a shared OAuth client for arbitrary users.

## 1. Google Auth Platform

1. Open the Google Cloud Console's Personal mode onboarding page.
2. Select or create the Personal mode project and create a **Web application** OAuth client.
3. Add this exact authorized redirect URI:

   `https://nellwick-ai-film-studio.vercel.app/api/drive/callback`

4. Save the OAuth Client ID and Client Secret privately.
5. Enable the Google Drive API for the selected Personal mode project if it is not already enabled.

Personal mode does not require OAuth app verification for the owner's own Google Account. The Personal mode project is restricted to the Google Account that created it and cannot later be converted to an External app. If NELLWICK is later opened to other users who each need to connect their own Drive, create a separate External OAuth project and follow Google's applicable verification requirements.

## 2. Vercel Production environment variables

In Vercel → NELLWICK project → Settings → Environment Variables, set the following for **Production**:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://nellwick-ai-film-studio.vercel.app` |
| `GOOGLE_CLIENT_ID` | The Personal mode Web application Client ID |
| `GOOGLE_CLIENT_SECRET` | The Personal mode Web application Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://nellwick-ai-film-studio.vercel.app/api/drive/callback` |
| `TOKEN_ENCRYPTION_KEY` | Random 32-byte value encoded as 64 hexadecimal characters |

Generate the encryption key in PowerShell:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
$key = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Set-Clipboard $key
Write-Host '64-character encryption key copied to clipboard.'
```

Never paste the Client Secret or encryption key into source code, GitHub, notebook cells, or chat. Do not replace the existing Supabase environment variables.

## 3. Redeploy and connect

1. Save the Vercel environment variables.
2. Redeploy the latest Production deployment.
3. Sign in to NELLWICK and open Settings & connections.
4. Click Connect Google Drive and authorize with the same Google Account that created the Personal mode app.
5. NELLWICK requests offline access and the `drive.file` scope, creates the `NELLWICK AI FILM STUDIO` folder, and stores the refresh token encrypted in Supabase.

The authorization and token exchange routes use the same redirect URI helper. In production, the application falls back to the actual request origin rather than redirecting to `localhost` when `NEXT_PUBLIC_APP_URL` is missing. Configure the explicit Production URL above regardless, so the registered Google callback remains predictable.

## Troubleshooting

- `missing_google_config`: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Vercel Production.
- `missing_encryption_key`: set `TOKEN_ENCRYPTION_KEY` to exactly 64 hexadecimal characters.
- `invalid_google_redirect`: ensure `GOOGLE_REDIRECT_URI` is HTTPS and ends in `/api/drive/callback`.
- `redirect_uri_mismatch`: the Google OAuth client authorized redirect URI and Vercel `GOOGLE_REDIRECT_URI` must match character-for-character.
- `access_denied`: complete authorization using the Google Account that created the Personal mode app.
