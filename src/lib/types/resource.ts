import { z } from "zod";

export const RESOURCE_TYPES = ["article", "tip", "video", "guide"] as const;

/** Chỉ chữ thường không dấu, số và dấu gạch ngang. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang",
});

export const resourceSchema = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema,
  type: z.enum(RESOURCE_TYPES),
  category: z.string().min(1).max(60),
  tags: z.array(z.string().max(40)).max(15),
  content: z.string().min(1),
  videoUrl: z.string().url().nullable(),
  status: z.enum(["draft", "published"]),
  visibility: z.enum(["public", "student_only"]),
  createdBy: z.string().min(1),
});

export const favoriteSchema = z.object({
  resourceId: z.string().min(1),
  usedAt: z.date().nullable(),
});

export type Resource = z.infer<typeof resourceSchema>;
export type Favorite = z.infer<typeof favoriteSchema>;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
