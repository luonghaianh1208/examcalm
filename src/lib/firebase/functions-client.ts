"use client";

import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp, ensureAuthReady } from "./client";

const REGION = "asia-southeast1";
let connected = false;

function functionsInstance() {
  const fns = getFunctions(getFirebaseApp(), REGION);
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !connected) {
    connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    connected = true;
  }
  return fns;
}

/**
 * Khớp response thật của Cloud Function `setUserRole` (functions/src/admin/setUserRole.ts):
 * claim (auth) là nguồn sự thật, ghi mirror users/{uid} có thể lỗi mà KHÔNG throw —
 * mirrorWriteFailed cho caller biết claim đã đổi nhưng bản hiển thị có thể tạm chưa khớp.
 */
export type SetUserRoleResult = {
  ok: true;
  role: "student" | "admin";
  mirrorWriteFailed?: boolean;
};

export async function callSetUserRole(
  targetUid: string,
  role: "student" | "admin",
): Promise<SetUserRoleResult> {
  // Đóng race giữa lần điều hướng trang đầu tiên và lúc client Auth khôi phục
  // xong currentUser từ persistence — cùng lý do ensureAuthReady() ở client.ts
  // được gọi trước mọi lần ghi Firestore. Thiếu bước này, request gọi callable
  // đi ra trước khi ID token sẵn sàng, server thấy request.auth = undefined và
  // từ chối với "Bạn cần đăng nhập." dù người dùng thực sự đã đăng nhập.
  await ensureAuthReady();
  const fn = httpsCallable<{ targetUid: string; role: string }, SetUserRoleResult>(
    functionsInstance(),
    "setUserRole",
  );
  const result = await fn({ targetUid, role });
  return result.data;
}

/**
 * Khớp response thật của Cloud Function `deleteUserData`
 * (functions/src/admin/deleteUserData.ts): mỗi field là số document đã xóa ở
 * từng collection — danh sách MƯỜI field này đi thẳng theo
 * `collectDeletionTargets()` (functions/src/admin/deleteUserData.logic.ts,
 * trừ "users/{uid}" xử lý riêng). M10 (final whole-branch review): type này
 * từng chỉ có 5/10 field (thiếu `answers`, `cbtSessions`, `chatSessions`,
 * `chatMessages`, `crisisAlerts` — rơi rớt sau các lần thêm collection ở
 * Spec #2/#4) — không ảnh hưởng runtime (không có call site nào đọc field
 * riêng lẻ), nhưng khiến type không còn khớp thật, gây hiểu nhầm khi đọc mã.
 * `authDeleteFailed` chỉ xuất hiện khi dữ liệu Firestore đã xóa xong nhưng bản
 * ghi Auth (đăng nhập) chưa xóa được vì lý do khác "đã xóa từ trước" (thiếu
 * quyền, hết quota, mất kết nối...) — hàm KHÔNG throw trong trường hợp đó, vì
 * dữ liệu thật sự đã bị xóa, caller cần phân biệt "xóa thất bại" với "xóa xong
 * nhưng còn sót Auth".
 */
export type DeleteUserDataResult = {
  ok: true;
  deleted: {
    attempts: number;
    answers: number;
    moods: number;
    cbtSessions: number;
    aiJournalOutputs: number;
    aiUsage: number;
    chatSessions: number;
    chatMessages: number;
    crisisAlerts: number;
    favorites: number;
  };
  authDeleteFailed?: boolean;
};

export async function callDeleteUserData(targetUid: string): Promise<DeleteUserDataResult> {
  // Đóng race giống callSetUserRole ở trên — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const fn = httpsCallable<{ targetUid: string }, DeleteUserDataResult>(
    functionsInstance(),
    "deleteUserData",
  );
  const result = await fn({ targetUid });
  return result.data;
}

/**
 * Khớp response thật của Cloud Function `generateReflection`
 * (functions/src/ai/generateReflection.ts): trả về id của document vừa tạo ở
 * aiJournalOutputs. Callable ném HttpsError cho mọi lỗi (kill switch, chưa
 * cấu hình, chưa bật đồng ý AI, hết quota, lỗi model...) — hàm này CỐ Ý không
 * bọc lỗi thành tiếng Việt, để nguyên mã lỗi callable cho caller
 * (src/lib/firestore/ai-outputs.ts) tự dịch, cùng lý do functions-client.ts
 * chỉ là lớp gọi callable mỏng, không chứa quyết định UX.
 */
export type GenerateReflectionResult = { outputId: string };

export async function callGenerateReflection(
  moodLogId: string,
): Promise<GenerateReflectionResult> {
  // Đóng race giống callSetUserRole/callDeleteUserData ở trên — xem giải
  // thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const fn = httpsCallable<{ moodLogId: string }, GenerateReflectionResult>(
    functionsInstance(),
    "generateReflection",
  );
  const result = await fn({ moodLogId });
  return result.data;
}

/**
 * Khớp response thật của Cloud Function `testAiConnection`
 * (functions/src/ai/testConnection.ts): admin-only, gửi một prompt cố định ngắn để kiểm tra
 * baseUrl/model/API key đã cắm đúng chưa. Trả về `ok: false` kèm `kind`/`message` đã được
 * sanitise cho lỗi provider — KHÔNG BAO GIỜ raw response text, header, baseUrl hay API key.
 */
export type TestAiConnectionResult =
  | { ok: true }
  | { ok: false; kind: string; message: string };

export async function callTestAiConnection(): Promise<TestAiConnectionResult> {
  // Đóng race giống callSetUserRole/callDeleteUserData/callGenerateReflection ở trên — xem
  // giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const fn = httpsCallable<Record<string, never>, TestAiConnectionResult>(
    functionsInstance(),
    "testAiConnection",
  );
  const result = await fn({});
  return result.data;
}

/**
 * Khớp response thật của Cloud Function `saveAiConfig` (functions/src/admin/saveAiConfig.ts,
 * fix I4+I5 — final whole-branch review): ghi ATOMIC systemConfig/aiConfig + aiPublic bằng
 * Admin SDK (bỏ qua rules, không đụng vấn đề get() không thấy được write cùng batch) VÀ ghi
 * auditLogs trước/sau baseUrl/providerLabel/killSwitch — hành động mạnh nhất của tính năng
 * (đổi nơi ghi chú riêng tư của học sinh đi tới) không còn im lặng nữa. Thay thế writeBatch
 * trực tiếp từ client trước đây ở src/lib/firestore/admin-ai.ts.
 */
export async function callSaveAiConfig(config: Record<string, unknown>): Promise<{ ok: true }> {
  await ensureAuthReady();
  const fn = httpsCallable<Record<string, unknown>, { ok: true }>(functionsInstance(), "saveAiConfig");
  const result = await fn(config);
  return result.data;
}

/**
 * Khớp response thật của Cloud Function `sendChatMessage`
 * (functions/src/ai/sendChatMessage.ts): trả về id của tin nhắn TRẢ LỜI vừa tạo trong
 * `chatMessages` (không phải id tin của học sinh). Callable ném HttpsError cho mọi lỗi —
 * hàm này CỐ Ý không dịch sang tiếng Việt, để nguyên cho caller (src/lib/firestore/chat.ts)
 * tự dịch, cùng lý do callGenerateReflection ở trên: functions-client.ts chỉ là lớp gọi
 * callable mỏng, không chứa quyết định UX.
 *
 * I7 (final whole-branch review): `crisisReplyText` chỉ có mặt khi server phanh việc GHI vào
 * `chatMessages` (client gọi lặp quá nhanh trên nhánh Lớp 1 "urgent") — `messageId` khi đó là
 * chuỗi rỗng, KHÔNG có document nào được tạo. Caller (ChatWindow.tsx) hiện thẳng trường này
 * thay vì đọc lại chatMessages — đọc lại sẽ không thấy gì mới, vì cố ý không ghi.
 */
export type SendChatMessageResult = { messageId: string; crisisReplyText?: string };

export async function callSendChatMessage(
  sessionId: string,
  text: string,
): Promise<SendChatMessageResult> {
  // Đóng race giống các hàm callXxx khác ở trên — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const fn = httpsCallable<{ sessionId: string; text: string }, SendChatMessageResult>(
    functionsInstance(),
    "sendChatMessage",
  );
  const result = await fn({ sessionId, text });
  return result.data;
}

/**
 * Bề mặt "Hỏi về web app" — Brand Guideline §6.2.
 *
 * KHÔNG đi qua đồng ý AI, hạn mức hay kill switch: câu trả lời lấy từ FAQ trên
 * server, không có dữ liệu nào rời khỏi hệ thống. Nhưng vẫn đi qua lớp phát
 * hiện khủng hoảng — xem askWebAppHelp.ts.
 */
export type AskWebAppHelpResult = {
  answer: string;
  href?: string;
  hrefLabel?: string;
  isCrisisReply: boolean;
};

export async function callAskWebAppHelp(question: string): Promise<AskWebAppHelpResult> {
  // Đóng race giống các hàm callXxx khác — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const fn = httpsCallable<{ question: string }, AskWebAppHelpResult>(
    functionsInstance(),
    "askWebAppHelp",
  );
  const result = await fn({ question });
  return result.data;
}
