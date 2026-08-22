import { z } from "zod";

export const MOOD_CONTEXTS = ["standalone", "before", "after"] as const;

export const MOOD_ICONS = [
  "very_low", "low", "neutral", "calm", "happy",
] as const;

export const moodLogSchema = z.object({
  userId: z.string().min(1),
  moodScore: z.number().int().min(1).max(10),
  moodIcon: z.enum(MOOD_ICONS),
  note: z.string().max(2000),
  tags: z.array(z.string().max(40)).max(10),
  context: z.enum(MOOD_CONTEXTS),
  linkedActivityRef: z.string().nullable(),
  imageUrl: z.null(),
});

export type MoodLog = z.infer<typeof moodLogSchema>;
export type MoodContext = (typeof MOOD_CONTEXTS)[number];
export type MoodIcon = (typeof MOOD_ICONS)[number];
