/**
 * Bề mặt "Hỏi về web app" — chatbot phản hồi theo Brand Guideline §6.2.
 *
 * KHÁC HẲN sendChatMessage:
 *   - Không gọi mô hình ngôn ngữ. Câu trả lời lấy từ FAQ (webAppFaq.ts).
 *   - KHÔNG đòi học sinh bật đồng ý AI: không có dữ liệu nào rời khỏi hệ thống,
 *     nên bắt học sinh đồng ý gửi dữ liệu cho bên thứ ba là đòi hỏi vô lý.
 *   - KHÔNG tiêu hạn mức AI: không tốn tiền gọi API.
 *   - KHÔNG chịu kill switch AI: bề mặt này phải chạy được cả khi AI đang tắt,
 *     đó chính là lý do chủ sản phẩm chọn phương án này.
 *
 * GIỮ NGUYÊN một thứ: LỚP PHÁT HIỆN KHỦNG HOẢNG.
 *
 * Học sinh đang buồn vẫn có thể gõ "em muốn chết" vào đây — ô nhập nào cũng
 * vậy. Một con bot trả lời "mình chỉ hỗ trợ cách dùng web thôi" trong tình
 * huống đó tệ hơn hẳn việc không có bot. Nên mọi tin nhắn đều đi qua
 * detectCrisisKeywords TRƯỚC, và nếu có tín hiệu thì trả lời bằng
 * CRISIS_REPLY_TEXT kèm ghi cảnh báo cho thầy cô — dùng chung đúng đường ghi và
 * chống lụt với sendChatMessage (xem crisisAlerts.ts).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { detectCrisisKeywords } from "./crisisDetector";
import { CRISIS_REPLY_TEXT } from "./buildChatPrompt";
import { writeCrisisAlert } from "./crisisAlerts";
import { matchFaq } from "./webAppFaq";

const MAX_QUESTION_LENGTH = 500;

const inputSchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
});

export type AskWebAppHelpResult = {
  answer: string;
  href?: string;
  hrefLabel?: string;
  /** true khi câu trả lời là đường an toàn, không phải câu FAQ. */
  isCrisisReply: boolean;
};

export type AskWebAppHelpCallerAuth = { uid: string; emailVerified: boolean } | undefined;

export type AskWebAppHelpDeps = {
  db?: Firestore;
  now?: () => Date;
};

export async function runAskWebAppHelp(
  rawData: unknown,
  auth: AskWebAppHelpCallerAuth,
  deps: AskWebAppHelpDeps = {},
): Promise<AskWebAppHelpResult> {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập để dùng tính năng này.");
  }
  if (!auth.emailVerified) {
    throw new HttpsError(
      "failed-precondition",
      "Bạn cần xác thực email trước khi dùng tính năng này.",
    );
  }

  const parsed = inputSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Câu hỏi trống hoặc quá dài.");
  }

  const db = deps.db ?? getFirestore();
  const now = deps.now?.() ?? new Date();
  const question = parsed.data.question;

  // Lớp an toàn chạy TRƯỚC mọi thứ khác. Không có cổng vận hành nào (kill
  // switch, hạn mức, cấu hình) đứng trước nó được — đó là bài học từ Spec #4.
  const crisis = detectCrisisKeywords(question);
  if (crisis.severity !== null) {
    // Ghi cảnh báo là fail-open sẵn bên trong writeCrisisAlert: ghi hỏng cũng
    // KHÔNG được chặn câu trả lời an toàn tới học sinh.
    await writeCrisisAlert(db, auth.uid, crisis.severity, "keyword", now);
    return { answer: CRISIS_REPLY_TEXT, isCrisisReply: true };
  }

  const match = matchFaq(question);
  return {
    answer: match.answer,
    ...(match.href ? { href: match.href } : {}),
    ...(match.hrefLabel ? { hrefLabel: match.hrefLabel } : {}),
    isCrisisReply: false,
  };
}

export const askWebAppHelp = onCall({ region: "asia-southeast1" }, async (request) =>
  runAskWebAppHelp(
    request.data,
    request.auth
      ? { uid: request.auth.uid, emailVerified: request.auth.token.email_verified === true }
      : undefined,
  ),
);
