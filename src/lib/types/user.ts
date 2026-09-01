import { z } from "zod";

export const researchConsentSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.date().nullable(),
  version: z.string().min(1),
});

// Tùy chọn (optional) để hồ sơ CŨ (tạo trước khi có onboarding) vẫn parse được —
// chưa từng thấy welcome dialog/tour thì coi như welcomeSeenAt=null, hideTooltips=false.
/**
 * Máy trạng thái của tour hướng dẫn — Brand Guideline §6.4.
 *
 *   not_started  tài khoản mới, chưa hiện bước 1
 *   active       đang ở một bước
 *   paused       chọn "Để sau"; giữ currentStep để mở lại đúng chỗ
 *   dismissed    chọn "Bỏ qua"; KHÔNG tự chạy lại
 *   completed    đã đi hết; KHÔNG tự chạy lại
 *
 * paused khác dismissed ở đúng một điểm và đó là toàn bộ lý do tách hai trạng
 * thái: "Để sau" là lời hứa sẽ quay lại, nên phải nhớ đang dở ở đâu; "Bỏ qua"
 * là lời từ chối, nên không được hỏi lại.
 */
export const GUIDE_STATUSES = ["not_started", "active", "paused", "dismissed", "completed"] as const;

export const onboardingStateSchema = z.object({
  welcomeSeenAt: z.date().nullable(),
  hideTooltips: z.boolean(),
  // .default() để hồ sơ tạo trước khi có máy trạng thái vẫn parse được và rơi
  // đúng vào nhánh "chưa từng chạy tour".
  guideStatus: z.enum(GUIDE_STATUSES).default("not_started"),
  guideStep: z.number().int().min(0).default(0),
});

export type GuideStatus = (typeof GUIDE_STATUSES)[number];

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
