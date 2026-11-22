$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    throw 'Run this script from the NELLWICK project root. package.json was not found.'
}
if (-not (Test-Path -LiteralPath (Join-Path $root '0001_initial_schema.sql'))) {
    throw 'Place 0001_initial_schema.sql (the supplied setup SQL file) beside this script before running it.'
}

$filesToBackup = @(
    'src/lib/supabase/admin.ts',
    'src/lib/supabase/browser.ts',
    'src/lib/supabase/server.ts',
    'src/middleware.ts',
    'src/app/api/drive/register-upload/route.ts',
    '.env.example',
    'database/migrations/0001_initial_schema.sql'
)
$backupRoot = Join-Path $env:TEMP ('nellwick-supabase-setup-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

foreach ($relativePath in $filesToBackup) {
    $sourcePath = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Expected project file was not found: $relativePath. No project files have been changed yet."
    }
    $backupPath = Join-Path $backupRoot $relativePath
    $backupDirectory = Split-Path -Parent $backupPath
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $backupPath -Force
}

@'
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let adminClient: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase server configuration is incomplete.");
  }

  if (!adminClient) {
    adminClient = createSupabaseClient<Database>(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}
'@ | Set-Content -LiteralPath (Join-Path $root 'src/lib/supabase/admin.ts') -Encoding utf8

@'
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key to .env.local.",
    );
  }

  return createBrowserClient<Database>(url, publishableKey);
}
'@ | Set-Content -LiteralPath (Join-Path $root 'src/lib/supabase/browser.ts') -Encoding utf8

@'
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase is not configured.");
  }

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies.
          // Middleware handles session refresh.
        }
      },
    },
  });
}
'@ | Set-Content -LiteralPath (Join-Path $root 'src/lib/supabase/server.ts') -Encoding utf8

@'
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
'@ | Set-Content -LiteralPath (Join-Path $root 'src/middleware.ts') -Encoding utf8

@'
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshGoogleAccessToken } from "@/lib/google-drive";

const schema = z.object({
  file_id: z.string().min(5),
  project_id: z.string().uuid().optional(),
  source_type: z.enum(["uploaded", "generated", "rendered"]).default("uploaded"),
});

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Drive file reference." }, { status: 400 });
  }

  // Validate the optional project with the signed-in user's RLS-scoped client.
  // The admin client below bypasses RLS, so this ownership check must happen first.
  if (parsed.data.project_id) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", parsed.data.project_id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json(
        { error: "The selected project does not belong to your account." },
        { status: 404 },
      );
    }
  }

  try {
    const auth = await refreshGoogleAccessToken(user.id);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.data.file_id)}?fields=id,name,mimeType,size,parents,webViewLink`,
      {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        cache: "no-store",
      },
    );
    const file = await response.json();
    if (!response.ok) {
      throw new Error(file.error?.message || "Could not verify Drive file.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("assets")
      .insert({
        owner_id: user.id,
        project_id: parsed.data.project_id || null,
        name: file.name,
        mime_type: file.mimeType,
        file_size: Number(file.size || 0),
        source_type: parsed.data.source_type,
        storage_provider: "google_drive",
        drive_file_id: file.id,
        drive_path: "NELLWICK AI FILM STUDIO/Uploads",
        metadata: { webViewLink: file.webViewLink || null },
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register uploaded media." },
      { status: 409 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $root 'src/app/api/drive/register-upload/route.ts') -Encoding utf8

@'
# Supabase project connection (Project URL + current API keys)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Optional legacy-key fallbacks if your project dashboard only shows the old names:
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# App URL, with no trailing slash. Local development uses this value.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google Cloud Console OAuth 2.0 Web application credentials.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback

# Generate a 32-byte key (64 hexadecimal characters). Server only.
# Example: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=
'@ | Set-Content -LiteralPath (Join-Path $root '.env.example') -Encoding utf8

Copy-Item -LiteralPath (Join-Path $root '0001_initial_schema.sql') -Destination (Join-Path $root 'database/migrations/0001_initial_schema.sql') -Force

Write-Host "`nSupabase preparation applied." -ForegroundColor Green
Write-Host "Backups saved to: $backupRoot"
Write-Host "The .env.local file was NOT changed. No secrets were created or copied."
Write-Host "Next run: npm run typecheck; npm run build"
Write-Host "Then inspect changes with: git status --short"
