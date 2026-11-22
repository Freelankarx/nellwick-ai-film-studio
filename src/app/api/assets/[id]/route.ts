import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshGoogleAccessToken } from "@/lib/google-drive";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  project_id: z.string().uuid().nullable().optional(),
  episode_id: z.string().uuid().nullable().optional(),
  is_favorite: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  deleted: z.boolean().optional(),
});

type AssetPatch = {
  name?: string;
  project_id?: string | null;
  episode_id?: string | null;
  is_favorite?: boolean;
  tags?: string[];
  deleted_at?: string | null;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid media update." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: asset } = await admin
    .from("assets")
    .select("id,drive_file_id,name,storage_provider")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!asset) {
    return NextResponse.json(
      { error: "Media asset not found." },
      { status: 404 },
    );
  }

  const patch: AssetPatch = {};

  if (parsed.data.name !== undefined) {
    patch.name = parsed.data.name;

    if (asset.storage_provider === "google_drive" && asset.drive_file_id) {
      try {
        const auth = await refreshGoogleAccessToken(user.id);

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(asset.drive_file_id)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${auth.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: parsed.data.name }),
            cache: "no-store",
          },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message || "Google Drive rename failed.",
          );
        }
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Could not rename Drive file.",
          },
          { status: 409 },
        );
      }
    }
  }

  if (parsed.data.project_id !== undefined) {
    if (parsed.data.project_id) {
      const { data: project } = await admin
        .from("projects")
        .select("id")
        .eq("id", parsed.data.project_id)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!project) {
        return NextResponse.json(
          { error: "The selected project does not belong to your account." },
          { status: 404 },
        );
      }
    }

    patch.project_id = parsed.data.project_id;

    if (parsed.data.project_id === null) {
      patch.episode_id = null;
    }
  }

  if (parsed.data.episode_id !== undefined) {
    if (parsed.data.episode_id) {
      const { data: episode } = await admin
        .from("episodes")
        .select("id,project_id")
        .eq("id", parsed.data.episode_id)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!episode) {
        return NextResponse.json(
          { error: "The selected episode does not belong to your account." },
          { status: 404 },
        );
      }

      if (
        parsed.data.project_id !== undefined &&
        episode.project_id !== parsed.data.project_id
      ) {
        return NextResponse.json(
          { error: "The episode does not belong to the selected project." },
          { status: 400 },
        );
      }

      if (parsed.data.project_id === undefined && episode.project_id) {
        patch.project_id = episode.project_id;
      }
    }

    patch.episode_id = parsed.data.episode_id;
  }

  if (parsed.data.is_favorite !== undefined) {
    patch.is_favorite = parsed.data.is_favorite;
  }

  if (parsed.data.tags !== undefined) {
    patch.tags = parsed.data.tags;
  }

  if (parsed.data.deleted !== undefined) {
    patch.deleted_at = parsed.data.deleted
      ? new Date().toISOString()
      : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No changes were provided." },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("assets")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id,name,project_id,episode_id,is_favorite,tags,deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ asset: data });
}
