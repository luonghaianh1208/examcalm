import { z } from "zod";

export const optionSchema = z.object({
  label: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(optionSchema).min(2),
});

export const thresholdSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  level: z.string().min(1),
  interpretation: z.string().min(1),
});

export const testDefinitionSchema = z.object({
  title: z.string().min(1),
  version: z.number().int().min(1),
  status: z.enum(["draft", "published"]),
  isSampleContent: z.boolean(),
  questions: z.array(questionSchema),
  scoring: z.object({ thresholds: z.array(thresholdSchema) }),
  disclaimer: z.string().min(1),
  /**
   * Bài test này giúp học sinh hiểu điều gì — phản hồi 1.3.
   *
   * Nội dung do thầy cô soạn, không sinh ra từ code. Để trống thì dòng này
   * không hiện, chứ không tự bịa một câu mô tả.
   */
  purpose: z.string().max(300).default(""),
  /**
   * Tên chuyên gia đã thẩm định nội dung — phản hồi 1.4.
   *
   * Chuỗi rỗng nghĩa là CHƯA được thẩm định, và màn hình phải nói thẳng điều
   * đó. Đây là dự án KHKT sẽ bị hỏi về căn cứ khoa học: im lặng để người đọc
   * tự suy ra là đã có chuyên gia duyệt thì tệ hơn hẳn việc nói chưa có.
   */
  expertReviewedBy: z.string().max(200).default(""),
  updatedBy: z.string().min(1),
});

export const testAttemptSchema = z.object({
  userId: z.string().min(1),
  testId: z.string().min(1),
  testVersion: z.number().int().min(1),
  score: z.number().int(),
  level: z.string().min(1),
});

// Đáp án từng câu tách riêng khỏi testAttempts (cùng id) — Firestore Rules
// không kiểm soát được theo field trong một document, nên "admin thấy điểm
// nhưng không thấy đáp án" chỉ làm được bằng cách tách document. Xem
// firestore.rules và src/lib/firestore/attempts.ts.
export const testAnswerSchema = z.object({
  userId: z.string().min(1),
  answers: z.record(z.string(), z.number().int()),
});

export type Option = z.infer<typeof optionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Threshold = z.infer<typeof thresholdSchema>;
export type TestDefinition = z.infer<typeof testDefinitionSchema>;
export type TestAttempt = z.infer<typeof testAttemptSchema>;
export type TestAnswer = z.infer<typeof testAnswerSchema>;
