import { z } from "zod";

export const researchConsentSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.date().nullable(),
  version: z.string().min(1),
});

// Tùy chọn (optional) để hồ sơ CŨ (tạo trước khi có onboarding) vẫn parse được —
// chưa từng thấy welcome dialog/tour thì coi như welcomeSeenAt=null, hideTooltips=false.
export const onboardingStateSchema = z.object({
  welcomeSeenAt: z.date().nullable(),
  hideTooltips: z.boolean(),
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
  onboarding: onboardingStateSchema.optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type ResearchConsent = z.infer<typeof researchConsentSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const DEFAULT_PRIVACY_SETTINGS = {
  aiOptIn: false,
  shareImageWithAI: false,
} as const;
