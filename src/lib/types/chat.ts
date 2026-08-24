import { z } from "zod";

// Trần ký tự một tin nhắn — chặn học sinh (hay lỗi client) gửi một khối văn bản khổng lồ đội
// chi phí và làm hỏng cửa sổ ngữ cảnh. 2000 ký tự đủ cho vài đoạn văn, thừa cho một lượt chat.
export const CHAT_MESSAGE_MAX_CHARS = 2000;

// Số lượt (tin của cả user lẫn assistant) gửi lại kèm mỗi request — cửa sổ trượt có trần thay
// vì gửi lại toàn bộ lịch sử (design spec §2, §6: chi phí tăng tuyến tính mãi mãi, vài tuần là
// vỡ context). 10 lượt (~5 lượt hỏi-đáp) đủ để model nhớ mạch chuyện trong phiên hiện tại mà
// không kéo chi phí tin thứ 30 lên quá xa tin thứ nhất.
export const CHAT_WINDOW_SIZE = 10;

export const chatSessionSchema = z.object({
  userId: z.string().min(1),
  startedAt: z.date(),
  lastMessageAt: z.date(),
  messageCount: z.number().int().min(0),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;

export const chatMessageSchema = z.object({
  // Trùng lặp có chủ đích với userId của chatSession cha — design spec §4: rule Firestore đọc
  // được mà không cần get() tài liệu cha.
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARS),
  isCrisisResponse: z.boolean(),
  createdAt: z.date(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// Cảnh báo khủng hoảng gửi tới admin — design spec §3.4. CỐ Ý không có field nào mang nguyên
// văn học sinh viết (không messageText, không trích đoạn, không tóm tắt): việc của thầy cô là
// đi gặp em đó, không phải đọc em viết gì, và một em biết câu chữ của mình bị đọc nguyên văn sẽ
// không viết thật lần sau. Xem test guard đọc field name tại runtime trong chat.test.ts —
// không được thêm field nào tên chứa text/message/content/excerpt/summary vào schema này.
export const crisisAlertSchema = z.object({
  userId: z.string().min(1),
  severity: z.enum(["urgent", "concern"]),
  triggeredBy: z.enum(["keyword", "model", "both"]),
  createdAt: z.date(),
  handledBy: z.string().min(1).nullable(),
  handledAt: z.date().nullable(),
});

export type CrisisAlert = z.infer<typeof crisisAlertSchema>;
