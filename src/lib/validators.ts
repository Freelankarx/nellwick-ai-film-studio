import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional().default(""),
  project_type: z.enum(["film", "series", "advertisement", "documentary", "social", "other"]).default("film"),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:5"]).default("16:9")
});

export const jobSchema = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  prompt: z.string().trim().min(10).max(4000).optional(),
  shotPrompts: z.array(z.string().trim().min(10).max(4000)).min(1).max(120).optional(),
  modelId: z.string().default("wan21-t2v-1.3b"),
  duration: z.number().int().min(2).max(5).default(5),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9")
}).refine((value) => Boolean(value.shotPrompts?.length || value.prompt), {
  message: "Provide at least one shot prompt."
});
