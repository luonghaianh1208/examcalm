import { z } from "zod";

export const researchConsentSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.date().nullable(),
  version: z.string().min(1),
});

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["student", "admin"]),
  nickname: z.string().min(1).max(50),
  gradeLevel: z.enum(["10", "11", "12"]),
  school: z.string().min(1).max(120),
  examGoals: z.array(z.string().max(100)).max(10),
  privacySettings: z.object({
    aiOptIn: z.boolean(),
    shareImageWithAI: z.boolean(),
  }),
  researchConsent: researchConsentSchema.nullable(),
  deletionRequestedAt: z.date().nullable(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type ResearchConsent = z.infer<typeof researchConsentSchema>;

export const DEFAULT_PRIVACY_SETTINGS = {
  aiOptIn: false,
  shareImageWithAI: false,
} as const;
