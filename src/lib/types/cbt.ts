import { z } from "zod";

export const cbtStepSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  hint: z.string(),
});

export const cbtModuleSchema = z.object({
  title: z.string().min(1).max(200),
  version: z.number().int().min(1),
  status: z.enum(["draft", "published"]),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  intro: z.string(),
  steps: z.array(cbtStepSchema).min(1).max(12),
  closingText: z.string(),
  suggestedResourceSlugs: z.array(z.string()).max(5),
  updatedBy: z.string(),
});

export const cbtSessionSchema = z.object({
  userId: z.string().min(1),
  moduleId: z.string().min(1),
  moduleVersion: z.number().int().min(1),
  // Câu trả lời tự luận ngắn. PRD §5.5 ghi `any`; ở đây là `string` vì mọi
  // bước trong spec này đều là câu hỏi mở — xem design spec §4.2.
  answers: z.record(z.string(), z.string().max(2000)),
  // Học sinh tự viết, được phép để trống — xem design spec §9 điểm 5.
  summary: z.string().max(2000),
});

export type CbtStep = z.infer<typeof cbtStepSchema>;
export type CbtModule = z.infer<typeof cbtModuleSchema>;
export type CbtSession = z.infer<typeof cbtSessionSchema>;
