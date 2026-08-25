// ExamCalm Spec #5, Task 2. Trigger Firestore onDocumentCreated("crisisAlerts/{alertId}") — gửi
// mail cho MỌI admin ngay khi một cảnh báo khủng hoảng được ghi. Admin lấy từ Firebase Auth theo
// custom claim `role === "admin"` (xem functions/src/admin/setUserRole.ts — claim là nguồn xác
// thực cho quyền), KHÔNG phải field `role` của Firestore `users/{uid}` — document đó không có
// trường email (task-2-brief.md).
//
// File mỏng, ráp module thuần resendClient.sendEmail (Task 1) với Firestore Admin SDK + Firebase
// Auth — cùng khuôn với functions/src/ai/sendChatMessage.ts: đọc secret qua defineSecret, mọi
// dependency chạm mạng/DB đều tiêm qua deps (kể cả Auth accessor) để lõi test được với Firestore
// emulator mà không cần Auth emulator.
//
// Ba luật không được phá (task-2-brief.md):
// 1. Thân mail CHỈ chứa danh sách field tường minh cho phép (buildEmailBody bên dưới) — không
//    bao giờ spread nguyên document cảnh báo.
// 2. Trigger KHÔNG BAO GIỜ ném ra ngoài — cảnh báo đã nằm trong Firestore; throw ở đây chỉ tạo
//    retry lặp cho một sự kiện gửi mail, tức là spam admin, không phải "thử lại giúp học sinh".
// 3. Nhưng thất bại phải nhìn thấy được — MỌI đường ra đều ghi `emailStatus` (+ `emailedAt` khi
//    gửi thành công) lên chính document cảnh báo.

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  sendEmail as sendEmailDefault,
  EmailError,
  type SendEmailParams,
  type SendEmailResult,
} from "./resendClient";
import { aiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from "../ai/config";

/** Secret chứa API key Resend — KHÔNG BAO GIỜ đọc từ process.env trực tiếp, khai báo trong
 *  `secrets: [...]` của onDocumentCreated để Cloud Functions bơm giá trị vào runtime (cùng khuôn
 *  với aiApiKeySecret của sendChatMessage.ts). */
const resendApiKeySecret = defineSecret("EXAMCALM_RESEND_API_KEY");

/** Timeout cho một lượt gọi Resend — ngắn hơn AI_REQUEST_TIMEOUT_MS của sendChatMessage.ts (30s):
 *  đây là một request gửi mail đơn giản, không phải một lượt suy luận của model. */
const EMAIL_TIMEOUT_MS = 10_000;

// URL công khai của app — chưa có biến môi trường riêng cho URL này ở phía functions/ (chỉ
// NEXT_PUBLIC_* khai báo ở apphosting.yaml, phía src/, không đọc được từ đây). Mail nằm trong
// hộp thư cá nhân nên link PHẢI bấm được thẳng, không phải đường dẫn tương đối — cùng domain
// redirect-site/index.html đã dùng.
const ADMIN_CRISIS_ALERTS_URL =
  "https://examcalm-web--examcalm.asia-southeast1.hosted.app/admin/canh-bao";

const SEVERITY_LABEL: Record<"urgent" | "concern", string> = {
  urgent: "Khẩn cấp",
  concern: "Cần chú ý",
};

// Định dạng giờ Việt Nam tường minh (timeZone) — hàm này chạy trên Cloud Functions runtime
// (UTC), không phải trình duyệt của thầy cô như CrisisAlertList.tsx. Đây là format HIỂN THỊ,
// khác quy ước offset cố định của functions/src/ai/quota.ts (đó là tính KHOÁ NGÀY xác định để
// reset quota, không phải hiển thị cho người đọc — dùng Intl ở đây là đúng chỗ).
const vnDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export type EmailStatus = "sent" | "failed" | "skipped";

/** Bề mặt tối thiểu của một Auth UserRecord mà module này cần — KHÔNG phải kiểu đầy đủ của SDK,
 *  chỉ hai field thực sự được đọc. `firebase-admin/auth` UserRecord thật thoả kiểu này (kể cả ở
 *  default listUsers bên dưới, không cần ép kiểu). */
export type AuthUserRecordLike = {
  email?: string;
  customClaims?: { role?: unknown };
};

export type ListUsersFn = () => Promise<AuthUserRecordLike[]>;

export type SendEmailFn = (
  params: SendEmailParams,
  deps?: { fetchImpl?: typeof fetch },
) => Promise<SendEmailResult>;

export type OnCrisisAlertCreatedDeps = {
  db: Firestore;
  /** Tiêm cùng cách sendChatMessage.ts tiêm `callChatCompletion` — test cấp một danh sách giả,
   *  không cần Auth emulator thật. */
  listUsers: ListUsersFn;
  sendEmail: SendEmailFn;
  apiKey: string;
  /** Mốc thời gian dùng cho `emailedAt` khi gửi thành công — nhận qua tham số để test kiểm soát
   *  được, cùng lý do `now` của SendChatMessageDeps. */
  now: Date;
};

/** Đọc `systemConfig/aiConfig` — cùng hành vi loadAiConfig của sendChatMessage.ts: doc thiếu
 *  hoặc sai hình dạng đều coi như "chưa cấu hình" (an toàn — mặc định crisisEmailEnabled=false),
 *  log lại ĐƯỜNG DẪN field sai, không phải giá trị. */
async function loadAiConfig(db: Firestore): Promise<AiConfig> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;

  const parsed = aiConfigSchema.safeParse(snap.data());
  if (!parsed.success) {
    console.error("onCrisisAlertCreated: systemConfig/aiConfig không hợp lệ, coi như tắt mail", {
      paths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return DEFAULT_AI_CONFIG;
  }
  return parsed.data;
}

/** Email admin — nguồn xác thực là custom claim `role === "admin"` trên Firebase Auth, KHÔNG
 *  phải field `role` của Firestore `users/{uid}` (users/{uid} không có trường email — xem
 *  task-2-brief.md). Tài khoản admin không có email bị bỏ qua thay vì làm hỏng cả danh sách. */
function extractAdminEmails(users: AuthUserRecordLike[]): string[] {
  const emails: string[] = [];
  for (const user of users) {
    if (user.customClaims?.role === "admin" && typeof user.email === "string" && user.email !== "") {
      emails.push(user.email);
    }
  }
  return emails;
}

type StudentInfo = { nickname: string | null; gradeLevel: string | null; school: string | null };

/** Đọc `users/{uid}` để lấy biệt danh/lớp/trường hiển thị trong mail — trích TỪNG field tường
 *  minh (không spread, cùng kỷ luật src/lib/firestore/admin-crisis.ts). Học sinh đã xoá tài
 *  khoản (doc không tồn tại) HOẶC bất kỳ lỗi đọc nào đều fail-open về null cho cả ba field —
 *  caller dùng uid thô thay thế (task-2-brief.md, "Hai chi tiết": một cảnh báo về người đã biến
 *  mất vẫn phải được gửi). */
async function loadStudentInfo(db: Firestore, userId: string): Promise<StudentInfo> {
  const empty: StudentInfo = { nickname: null, gradeLevel: null, school: null };
  if (userId === "") return empty;
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return empty;
    const data = snap.data() as Record<string, unknown>;
    return {
      nickname: typeof data.nickname === "string" ? data.nickname : null,
      gradeLevel: typeof data.gradeLevel === "string" ? data.gradeLevel : null,
      school: typeof data.school === "string" ? data.school : null,
    };
  } catch (error) {
    console.error("onCrisisAlertCreated: đọc users/{uid} thất bại — dùng uid thô thay thế", {
      message: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

/** Tiêu đề — KHÔNG BAO GIỜ chứa tên/biệt danh học sinh (task-2-brief.md, "Hai chi tiết": tiêu đề
 *  hiện trên màn hình khoá điện thoại nơi người đứng cạnh đọc được). Chỉ mang đủ để lọc hộp thư
 *  theo mức độ. */
function buildEmailSubject(severity: "urgent" | "concern"): string {
  return severity === "urgent"
    ? "[ExamCalm] Cảnh báo KHẨN CẤP — cần xử lý ngay"
    : "[ExamCalm] Cảnh báo cần chú ý";
}

/** Thân mail — DANH SÁCH FIELD TƯỜNG MINH, không bao giờ spread alert document (Luật 1). Đúng
 *  những gì được phép: biệt danh (hoặc uid thô), lớp, trường, mức độ, thời điểm, và link — không
 *  gì khác, đặc biệt không nội dung/trích đoạn/tóm tắt tin nhắn học sinh viết. */
function buildEmailBody(fields: {
  studentLabel: string;
  gradeLevel: string | null;
  school: string | null;
  severity: "urgent" | "concern";
  createdAt: Date;
}): string {
  return [
    `Học sinh: ${fields.studentLabel}`,
    `Lớp: ${fields.gradeLevel ?? "Không rõ"}`,
    `Trường: ${fields.school ?? "Không rõ"}`,
    `Mức độ: ${SEVERITY_LABEL[fields.severity]}`,
    `Thời điểm: ${vnDateTimeFormatter.format(fields.createdAt)}`,
    "",
    `Xem và xử lý: ${ADMIN_CRISIS_ALERTS_URL}`,
  ].join("\n");
}

type EmailOutcome = { status: EmailStatus; emailedAt: Date | null };

/** Quyết định + thực hiện việc gửi (hoặc bỏ qua) mail cho MỘT cảnh báo — KHÔNG ghi Firestore, chỉ
 *  trả về kết quả để runOnCrisisAlertCreated ghi lại (tách hai việc để dễ test riêng). */
async function decideAndSendEmail(
  alertData: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
): Promise<EmailOutcome> {
  const config = await loadAiConfig(deps.db);

  // Mục 1-2 (task-2-brief.md): hai gate cấu hình — KHÔNG gọi listUsers hay sendEmail nếu tính
  // năng tắt hoặc chưa cấu hình người gửi ("không gọi mạng").
  if (!config.crisisEmailEnabled) return { status: "skipped", emailedAt: null };
  if (config.crisisEmailFrom === "") return { status: "skipped", emailedAt: null };

  const users = await deps.listUsers();
  const adminEmails = extractAdminEmails(users);
  if (adminEmails.length === 0) return { status: "skipped", emailedAt: null };

  const userId = typeof alertData.userId === "string" ? alertData.userId : "";
  const severity = alertData.severity === "urgent" ? "urgent" : "concern";
  const createdAt = alertData.createdAt instanceof Timestamp ? alertData.createdAt.toDate() : deps.now;

  const student = await loadStudentInfo(deps.db, userId);
  const studentLabel = student.nickname ?? userId;

  const subject = buildEmailSubject(severity);
  const text = buildEmailBody({
    studentLabel,
    gradeLevel: student.gradeLevel,
    school: student.school,
    severity,
    createdAt,
  });

  try {
    await deps.sendEmail({
      apiKey: deps.apiKey,
      from: config.crisisEmailFrom,
      to: adminEmails,
      subject,
      text,
      timeoutMs: EMAIL_TIMEOUT_MS,
    });
    return { status: "sent", emailedAt: deps.now };
  } catch (error) {
    // Luật 2: KHÔNG ném — chỉ log đã khử nhạy cảm. EmailError.message không bao giờ chứa API
    // key (đảm bảo của Task 1), nhưng vẫn chỉ log `kind` để không lộ chi tiết nội bộ khác.
    console.error("onCrisisAlertCreated: gửi mail thất bại", {
      kind: error instanceof EmailError ? error.kind : "unknown",
    });
    return { status: "failed", emailedAt: null };
  }
}

/**
 * Lõi có thể test được — nhận alertId + dữ liệu document thô (giống `event.data.data()` thật) và
 * deps đã tiêm sẵn. KHÔNG BAO GIỜ ném ra ngoài (Luật 2) — mọi lỗi, kể cả lỗi không lường trước ở
 * bước ghi `emailStatus`, đều bị nuốt và log lại thay vì lan ra Cloud Functions runtime.
 */
export async function runOnCrisisAlertCreated(
  alertId: string,
  alertData: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
): Promise<void> {
  try {
    const outcome = await decideAndSendEmail(alertData, deps);
    // Luật 3: ghi lại trạng thái dù kết quả là gì — "im lặng" (không ghi gì) khi gửi hỏng tệ hơn
    // không gửi, vì hệ thống sẽ tin là đã báo trong khi chưa ai được báo.
    await deps.db
      .collection("crisisAlerts")
      .doc(alertId)
      .update({
        emailStatus: outcome.status,
        emailedAt: outcome.emailedAt !== null ? Timestamp.fromDate(outcome.emailedAt) : null,
      });
  } catch (error) {
    console.error(
      "onCrisisAlertCreated: xử lý thất bại ngoài dự kiến — nuốt lỗi, KHÔNG throw (Luật 2)",
      { message: error instanceof Error ? error.message : String(error) },
    );
  }
}

export const onCrisisAlertCreated = onDocumentCreated(
  { document: "crisisAlerts/{alertId}", region: "asia-southeast1", secrets: [resendApiKeySecret] },
  async (event) => {
    // Phòng thủ — onDocumentCreated luôn có data thật cho sự kiện "created", nhưng type khai báo
    // cho phép undefined (V2 SDK dùng chung shape với onDocumentWritten).
    if (!event.data) return;
    await runOnCrisisAlertCreated(event.params.alertId, event.data.data(), {
      db: getFirestore(),
      listUsers: async () => (await getAuth().listUsers()).users,
      sendEmail: sendEmailDefault,
      apiKey: resendApiKeySecret.value(),
      now: new Date(),
    });
  },
);
