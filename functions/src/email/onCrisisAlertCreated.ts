// ExamCalm Spec #5, Task 2. Trigger Firestore trên `crisisAlerts/{alertId}` — gửi mail cho MỌI
// admin ngay khi một cảnh báo khủng hoảng được ghi, VÀ gửi một mail CẬP NHẬT khi mức độ leo
// thang sau đó (concern → urgent, xem "Fix round 1, Finding 2" bên dưới). Admin lấy từ Firebase
// Auth theo custom claim `role === "admin"` (xem functions/src/admin/setUserRole.ts — claim là
// nguồn xác thực cho quyền), KHÔNG phải field `role` của Firestore `users/{uid}` — document đó
// không có trường email (task-2-brief.md).
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
//
// ==== Fix round 1 (review từ coordinator) — 5 finding ====
//
// Finding 1 (CRITICAL): `loadAiConfig` (đọc systemConfig/aiConfig) và `deps.listUsers()` (gọi
// mạng thật tới Identity Toolkit) là hai await KHÔNG được bọc trong bản trước — một throw ở đó
// thoát thẳng khỏi decideAndSendEmail, bỏ qua LUÔN bước ghi `emailStatus`. Document giữ nguyên
// KHÔNG có field này, và chat.ts:50-55 định nghĩa "thiếu field" là "trigger chưa chạy" — Task 3
// hiện "chưa rõ" cho một alert THẬT SỰ đã hỏng. SỬA: tách quyết định (`computeOutcomeSafely`,
// LUÔN trả về một EmailOutcome, không bao giờ throw) khỏi việc ghi (`writeEmailStatus`, MỘT nơi
// DUY NHẤT được phép nuốt lỗi im lặng — nếu ngay việc ghi trạng thái cũng lỗi thì không còn gì
// làm được nữa ngoài log).
//
// Finding 2 (Important): `sendChatMessage.ts` có thể nâng một alert từ "concern" lên "urgent"
// (`upgradeCrisisAlert`) VÀI TRĂM MILI-GIÂY sau khi mail ban đầu đã gửi với "Mức độ: Cần chú ý"
// — không có gì gửi lại, hộp thư permanently hiểu SAI mức độ. SỬA: chuyển sang `onDocumentWritten`
// — nhánh CREATE giữ nguyên hành vi cũ; nhánh UPDATE chỉ hành động khi CẢ HAI: severity thật sự
// tăng (concern → urgent, hướng DUY NHẤT được coi là escalation) VÀ mail ban đầu đã "sent". Một
// thay đổi không đụng severity (kể cả CHÍNH việc ghi `emailStatus` ở cuối luồng này) phải là
// no-op TUYỆT ĐỐI — không đọc thêm, không ghi thêm — để không tự kích hoạt lại chính nó.
//
// Finding 3 (Important): `getAuth().listUsers()` gọi một lần chỉ trả tối đa 1000 tài khoản —
// giới hạn vô hình nếu không lặp `pageToken`. Một trường >1000 tài khoản Auth có admin ngoài
// trang đầu sẽ ra danh sách rỗng và "skipped" — KHÔNG PHÂN BIỆT được với admin chủ ý tắt mail.
// SỬA: `listAllAuthUsers` lặp hết `pageToken` (chỉ dùng ở deps THẬT, không đổi bề mặt test).
//
// Finding 4 (Important): bản trước fallback `DEFAULT_AI_CONFIG` (crisisEmailEnabled=false) khi
// `safeParse` thất bại — document TỒN TẠI nhưng SAI HÌNH DẠNG bị ghi "skipped", y hệt một admin
// CHỦ Ý tắt mail. Ngày deploy Spec #5, `systemConfig/aiConfig` sản xuất được ghi TRƯỚC khi hai
// field mới tồn tại — safeParse thất bại cho TỚI KHI admin re-save — mọi cảnh báo trong cửa sổ
// đó lẽ ra phải hiện "gửi hỏng", không phải "đã chủ ý bỏ qua". SỬA: `loadAiConfig` trả kết quả
// phân biệt được — doc KHÔNG TỒN TẠI vẫn là "chưa cấu hình" (skip đúng), doc TỒN TẠI nhưng sai
// hình dạng là LỖI (failed).
//
// Finding 5 (Minor, ride along): (a) `studentLabel` giờ fallback trên CẢ chuỗi rỗng, không chỉ
// `null` (`firstNonEmpty`); (b) `nickname` do học sinh tự nhập và firestore.rules không kiểm tra
// độ dài khi owner ghi `users/{uid}` — cắt về đúng trần zod (50 ký tự) cho nhất quán; (c) thân
// mail có thêm một dòng ngữ cảnh (đây là tín hiệu nguy cơ tự hại, nội dung tin nhắn CỐ Ý không
// đưa vào); (d) mốc thời gian ghi rõ "(giờ Việt Nam)", và gửi qua `bcc` thay vì `to` — một admin
// forward lại mail không vô tình lộ toàn bộ email admin khác.
//
// ==== Fix round 2 (review từ coordinator) — 1 finding Important + 1 finding Minor ====
//
// Finding 1 (Important): guard escalation cũ (`before.emailStatus !== "sent"` → return) có HAI
// lỗ hổng chung một chỗ sửa — (a) gap đã tự flag ở Fix round 1: mail đầu "failed" rồi severity
// lên "urgent" → KHÔNG mail nào cho một cảnh báo urgent; (b) một race không thấy trước:
// `before.emailStatus` là trạng thái TẠI THỜI ĐIỂM `upgradeCrisisAlert` ghi — nếu lần ghi trạng
// thái của nhánh TẠO CHƯA xong (cửa sổ thời gian THẬT: sendChatMessage.ts đợi trọn một lượt suy
// luận model giữa lúc tạo alert và lúc nâng cấp), field này là `undefined`, guard cũ return sớm,
// TRONG KHI nhánh TẠO vẫn đang cầm snapshot "concern" CŨ và sắp gửi "Cần chú ý" rồi ghi "sent" —
// hộp thư hiểu SAI mức độ vĩnh viễn. SỬA: ba nhánh theo `before.emailStatus` — "skipped" → no-op
// (tôn trọng lựa chọn tắt); "sent" → gửi CẬP NHẬT (escalation, như cũ); "failed" HOẶC THIẾU
// (undefined) → gửi mail ĐẦY ĐỦ (kind "initial", đọc `after.severity`) — KHÔNG dùng kind
// "escalation" cho hai case cuối vì thân mail escalation nói "THAY THẾ đánh giá mức độ trong
// email trước đó", một lời nói dối khi chưa từng có mail nào chắc chắn tới nơi. Không có nguy cơ
// lặp vô tận (severity không đổi ở lần ghi tiếp theo); cái giá là khả năng gửi trùng khi race xảy
// ra — ruling "duplicate beats missing" (Fix round 1) đã chấp nhận đánh đổi này.
//
// Finding 2 (Minor): ba chỗ test yếu bị siết lại — test escalation-thành-công giờ khẳng định
// đúng dòng "Mức độ: Khẩn cấp" (không chỉ chuỗi con "Khẩn cấp", vốn đã có mặt sẵn trong đoạn văn
// escalation nên không chứng minh được dòng severity thật sự đổi); test chống-tự-kích-hoạt giờ
// so `emailedAt` TRƯỚC/SAU thay vì so `emailStatus` với chính nó (vốn luôn đúng khi cả hai đều
// "sent" dù handler có chạy lại hay không); fixture test config-sai-hình-dạng đổi thành ĐÚNG
// kịch bản production mô tả — spread `DEFAULT_AI_CONFIG` rồi bỏ CHỈ hai field Spec #5, thay vì
// một object gần như rỗng.

import { onDocumentWritten } from "firebase-functions/v2/firestore";
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
 *  `secrets: [...]` của onDocumentWritten để Cloud Functions bơm giá trị vào runtime (cùng khuôn
 *  với aiApiKeySecret của sendChatMessage.ts). */
const resendApiKeySecret = defineSecret("EXAMCALM_RESEND_API_KEY");

/** Timeout cho một lượt gọi Resend — ngắn hơn AI_REQUEST_TIMEOUT_MS của sendChatMessage.ts (30s):
 *  đây là một request gửi mail đơn giản, không phải một lượt suy luận của model. */
const EMAIL_TIMEOUT_MS = 10_000;

// URL công khai của app — chưa có biến môi trường riêng cho URL này ở phía functions/ (chỉ
// NEXT_PUBLIC_* khai báo ở apphosting.yaml, phía src/, không đọc được từ đây). Mail nằm trong
// hộp thư cá nhân nên link PHẢI bấm được thẳng, không phải đường dẫn tương đối.
//
// CÙNG domain đã hardcode ở redirect-site/index.html — HAI nơi, không phải một; đổi domain thật
// (custom domain riêng, hoặc đổi backend hosting) phải sửa CẢ HAI chỗ. Không tạo constant dùng
// chung giữa hai package (redirect-site/ là HTML tĩnh, không qua build nào, functions/ không
// import được nó) — nêu rõ ở đây để không ai chỉ sửa một nơi (Fix round 1, Finding 5).
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

/** `nickname` do học sinh tự nhập — firestore.rules cho owner ghi `users/{uid}` KHÔNG kiểm tra
 *  độ dài field (trần 50 ký tự của userSchema chỉ ở phía client/zod, rules không enforce), nên
 *  một chuỗi dài bất thường có thể tới thẳng hộp thư admin. Không phải nội dung tin nhắn (Luật 1
 *  vẫn đúng — đây là field ĐƯỢC PHÉP, chỉ cắt độ dài), nhưng vẫn cắt về đúng trần zod cho nhất
 *  quán, không phải một con số tuỳ tiện khác (Fix round 1, Finding 5). */
const NICKNAME_MAX_CHARS_IN_EMAIL = 50;

/** `school` do học sinh tự nhập — CÙNG lý do NICKNAME_MAX_CHARS_IN_EMAIL ở trên
 *  (firestore.rules không kiểm tra độ dài khi owner ghi `users/{uid}`; trần 120 ký tự của
 *  userProfileSchema.school chỉ ở phía client/zod). I1 (final whole-branch review): một học sinh
 *  muốn giáo viên đọc được lời nhắn có thể nhét cả một đoạn văn vào field này qua SDK trực tiếp
 *  (bỏ qua giới hạn 120 ký tự của UI hồ sơ) rồi kèm một từ khoá khủng hoảng — đoạn văn đó sẽ tới
 *  thẳng hộp thư MỌI admin, một đường vòng thẳng qua luật §3.4 (không mang nguyên văn học sinh
 *  viết). Cắt về đúng trần zod (120), không phải một con số tuỳ tiện khác — cùng nguyên tắc với
 *  nickname. */
const SCHOOL_MAX_CHARS_IN_EMAIL = 120;

/** I1 (final whole-branch review): `gradeLevel` là một enum ĐÓNG ("10"|"11"|"12" —
 *  userProfileSchema.gradeLevel) chứ không phải văn bản tự do như nickname/school — nhưng
 *  firestore.rules cũng KHÔNG kiểm tra giá trị này khi owner ghi `users/{uid}`, nên một giá trị
 *  NGOÀI enum (kể cả một đoạn văn dài) có thể tới thẳng hộp thư admin qua field "Lớp:" nếu chỉ
 *  kiểm tra `typeof === "string"` như nickname/school. Validate đúng tập giá trị đóng thay vì cắt
 *  độ dài — giá trị lạ rơi về `null` (hiện "Không rõ", giống trường hợp thiếu field). */
const VALID_GRADE_LEVELS = new Set(["10", "11", "12"]);

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

type LoadAiConfigResult = { ok: true; config: AiConfig } | { ok: false };

/** Đọc `systemConfig/aiConfig`. Fix round 1, Finding 4: phân biệt hai tình huống trước đây bị
 *  gộp làm một — doc KHÔNG TỒN TẠI (thật sự "chưa cấu hình", `DEFAULT_AI_CONFIG` an toàn và
 *  ĐÚNG) khác với doc TỒN TẠI nhưng SAI HÌNH DẠNG (có gì đó hỏng — caller phải ghi "failed", không
 *  phải "skipped"). Ném lại lỗi đọc Firestore thô (không tự bắt ở đây) — `computeOutcomeSafely`
 *  là nơi chịu trách nhiệm biến MỌI throw không lường trước thành "failed" (Finding 1). */
async function loadAiConfig(db: Firestore): Promise<LoadAiConfigResult> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return { ok: true, config: DEFAULT_AI_CONFIG };

  const parsed = aiConfigSchema.safeParse(snap.data());
  if (!parsed.success) {
    console.error(
      "onCrisisAlertCreated: systemConfig/aiConfig tồn tại nhưng sai hình dạng — coi là LỖI, " +
        "không phải 'chưa cấu hình'",
      { paths: parsed.error.issues.map((issue) => issue.path.join(".")) },
    );
    return { ok: false };
  }
  return { ok: true, config: parsed.data };
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

/** Auth accessor THẬT, dùng bởi Cloud Function export ở cuối file (KHÔNG phải deps test) — Fix
 *  round 1, Finding 3: `getAuth().listUsers()` một lần chỉ trả TỐI ĐA 1000 tài khoản; giới hạn
 *  đó VÔ HÌNH trong code nếu không lặp `pageToken`. Một trường >1000 tài khoản Auth có admin nằm
 *  ngoài trang đầu sẽ cho danh sách admin RỖNG và `emailStatus: "skipped"` — KHÔNG PHÂN BIỆT
 *  được với một admin CHỦ Ý tắt mail. */
async function listAllAuthUsers(): Promise<AuthUserRecordLike[]> {
  const auth = getAuth();
  const users: AuthUserRecordLike[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
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
      // I1: chỉ chấp nhận đúng ba giá trị enum — giá trị lạ (kể cả một đoạn văn) rơi về null.
      gradeLevel:
        typeof data.gradeLevel === "string" && VALID_GRADE_LEVELS.has(data.gradeLevel)
          ? data.gradeLevel
          : null,
      school: typeof data.school === "string" ? data.school : null,
    };
  } catch (error) {
    console.error("onCrisisAlertCreated: đọc users/{uid} thất bại — dùng uid thô thay thế", {
      message: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

/** Coi "" (sau trim) như rỗng/thiếu — cùng quy ước "" = sentinel rỗng đã dùng xuyên suốt file
 *  này (crisisEmailFrom, email admin). Trả giá trị KHÔNG rỗng đầu tiên, hoặc một placeholder
 *  tường minh nếu mọi giá trị đều rỗng/null. Fix round 1, Finding 5(a): trước fix này
 *  `nickname ?? userId` chỉ fallback trên `null` — nickname="" in thẳng "Học sinh: " trống trơn,
 *  trong khi cả nickname lẫn userId về lý thuyết đều có thể là "" tại đây. */
function firstNonEmpty(...values: (string | null)[]): string {
  for (const value of values) {
    if (value !== null && value.trim() !== "") return value;
  }
  return "(không xác định)";
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** Tiêu đề mail BAN ĐẦU — KHÔNG BAO GIỜ chứa tên/biệt danh học sinh (task-2-brief.md, "Hai chi
 *  tiết": tiêu đề hiện trên màn hình khoá điện thoại nơi người đứng cạnh đọc được). Chỉ mang đủ
 *  để lọc hộp thư theo mức độ. */
function buildEmailSubject(severity: "urgent" | "concern"): string {
  return severity === "urgent"
    ? "[ExamCalm] Cảnh báo KHẨN CẤP — cần xử lý ngay"
    : "[ExamCalm] Cảnh báo cần chú ý";
}

/** Tiêu đề mail CẬP NHẬT khi mức độ leo thang (Fix round 1, Finding 2) — LUÔN về hướng concern →
 *  urgent (guard ở runOnCrisisAlertUpdated đảm bảo không hướng nào khác gọi tới hàm này). PHẢI
 *  nói rõ đây là CẬP NHẬT một cảnh báo đã gửi trước đó, để một thầy cô lướt hộp thư không hiểu
 *  nhầm đây là một học sinh THỨ HAI. */
function buildEscalationEmailSubject(): string {
  return "[ExamCalm] CẬP NHẬT: mức độ tăng lên KHẨN CẤP (thay thế cảnh báo trước)";
}

type EmailKind = "initial" | "escalation";

/** Thân mail — DANH SÁCH FIELD TƯỜNG MINH, không bao giờ spread alert document (Luật 1). Đúng
 *  những gì được phép: biệt danh (hoặc uid thô), lớp, trường, mức độ, thời điểm, và link — không
 *  gì khác, đặc biệt không nội dung/trích đoạn/tóm tắt tin nhắn học sinh viết.
 *
 *  Fix round 1, Finding 5(c): thêm một dòng ngữ cảnh cố định (không phải field động) — một thầy
 *  cô chưa từng thấy mail này trước đây dễ đọc "Cảnh báo KHẨN CẤP" như một cảnh báo hệ thống
 *  chung chung nếu không có câu giải thích đây là tín hiệu nguy cơ tự hại và vì sao không có
 *  trích đoạn tin nhắn nào đi kèm. */
function buildEmailBody(fields: {
  studentLabel: string;
  gradeLevel: string | null;
  school: string | null;
  severity: "urgent" | "concern";
  createdAt: Date;
  kind: EmailKind;
}): string {
  const lines: string[] = [
    "Đây là cảnh báo NGUY CƠ TỰ HẠI từ hệ thống ExamCalm. Nội dung tin nhắn học sinh viết KHÔNG " +
      "được đưa vào email này — đây là quyết định thiết kế có chủ đích, không phải thiếu sót.",
    "",
  ];
  if (fields.kind === "escalation") {
    lines.push(
      "CẬP NHẬT: mức độ của cảnh báo này vừa TĂNG lên Khẩn cấp. Email này THAY THẾ đánh giá mức " +
        "độ trong email trước đó cho CÙNG một học sinh — không phải một cảnh báo mới.",
      "",
    );
  }
  lines.push(
    `Học sinh: ${fields.studentLabel}`,
    `Lớp: ${fields.gradeLevel ?? "Không rõ"}`,
    `Trường: ${fields.school ?? "Không rõ"}`,
    `Mức độ: ${SEVERITY_LABEL[fields.severity]}`,
    `Thời điểm: ${vnDateTimeFormatter.format(fields.createdAt)} (giờ Việt Nam)`,
    "",
    `Xem và xử lý: ${ADMIN_CRISIS_ALERTS_URL}`,
  );
  return lines.join("\n");
}

type EmailOutcome = { status: EmailStatus; emailedAt: Date | null };

/** Quyết định + thực hiện việc gửi (hoặc bỏ qua) mail cho MỘT cảnh báo — KHÔNG ghi Firestore, chỉ
 *  trả về kết quả để caller ghi lại (tách hai việc để dễ test riêng). `kind` chọn tiêu đề/thân
 *  mail BAN ĐẦU hay CẬP NHẬT — mọi gate cấu hình (bật/tắt, người gửi, danh sách admin) áp dụng
 *  như nhau cho cả hai, vì trạng thái hệ thống có thể đã đổi giữa lần gửi ban đầu và lúc leo
 *  thang. CÓ THỂ throw (không tự bọc try/catch bao trùm) — `computeOutcomeSafely` là nơi chịu
 *  trách nhiệm đó (Fix round 1, Finding 1). */
async function decideAndSendEmail(
  alertData: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
  kind: EmailKind,
): Promise<EmailOutcome> {
  const configResult = await loadAiConfig(deps.db);
  if (!configResult.ok) return { status: "failed", emailedAt: null };
  const config = configResult.config;

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
  const studentLabel = firstNonEmpty(
    student.nickname !== null ? truncate(student.nickname, NICKNAME_MAX_CHARS_IN_EMAIL) : null,
    userId,
  );

  const subject = kind === "escalation" ? buildEscalationEmailSubject() : buildEmailSubject(severity);
  const text = buildEmailBody({
    studentLabel,
    gradeLevel: student.gradeLevel,
    // I1 (final whole-branch review): cắt về đúng trần zod, cùng lý do/vị trí với nickname ở trên.
    school: student.school !== null ? truncate(student.school, SCHOOL_MAX_CHARS_IN_EMAIL) : null,
    severity,
    createdAt,
    kind,
  });

  try {
    await deps.sendEmail({
      apiKey: deps.apiKey,
      from: config.crisisEmailFrom,
      // Fix round 1, Finding 5(d): gửi qua BCC, không phải TO — `to` chỉ chứa CHÍNH địa chỉ
      // người gửi (kỹ thuật gửi hàng loạt phổ biến, Resend chấp nhận `to` trùng `from`) để một
      // admin FORWARD lại mail không vô tình lộ toàn bộ email admin khác trong header "To:".
      to: [config.crisisEmailFrom],
      bcc: adminEmails,
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

/** Fix round 1, Finding 1 (CRITICAL): bọc TOÀN BỘ `decideAndSendEmail` — trước fix này, một
 *  throw ở `loadAiConfig`/`deps.listUsers()` thoát thẳng khỏi hàm, bỏ qua LUÔN bước ghi
 *  `emailStatus` phía dưới (hai await đó không nằm trong nhánh try/catch nào). Document giữ
 *  nguyên KHÔNG có field `emailStatus`, và chat.ts định nghĩa "thiếu field" là "trigger chưa
 *  chạy" — Task 3 hiện "chưa rõ" cho một cảnh báo THẬT SỰ đã hỏng, đúng sự im lặng Luật 3 tồn tại
 *  để ngăn. LUÔN trả về một EmailOutcome — không bao giờ throw — mặc định "failed" cho MỌI lỗi
 *  không lường trước (không chỉ lỗi gửi mail, vốn đã tự bọc bên trong decideAndSendEmail rồi). */
async function computeOutcomeSafely(
  alertData: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
  kind: EmailKind,
): Promise<EmailOutcome> {
  try {
    return await decideAndSendEmail(alertData, deps, kind);
  } catch (error) {
    console.error(
      "onCrisisAlertCreated: xác định/gửi mail thất bại ngoài dự kiến (đọc cấu hình hoặc " +
        "listUsers) — coi là 'failed', KHÔNG phải 'skipped'",
      { message: error instanceof Error ? error.message : String(error) },
    );
    return { status: "failed", emailedAt: null };
  }
}

/** Ghi `emailStatus` (+ `emailedAt`) lên document cảnh báo — NƠI DUY NHẤT trong file này được
 *  phép nuốt lỗi hoàn toàn im lặng (Luật 2): nếu ngay cả việc ghi lại trạng thái cũng lỗi, không
 *  còn gì để làm ngoài log lại — ném ra chỉ tạo retry cho một document ĐÃ tồn tại trong Firestore
 *  từ trước. */
async function writeEmailStatus(db: Firestore, alertId: string, outcome: EmailOutcome): Promise<void> {
  try {
    await db
      .collection("crisisAlerts")
      .doc(alertId)
      .update({
        emailStatus: outcome.status,
        emailedAt: outcome.emailedAt !== null ? Timestamp.fromDate(outcome.emailedAt) : null,
      });
  } catch (error) {
    console.error(
      "onCrisisAlertCreated: ghi emailStatus thất bại — nuốt lỗi, KHÔNG throw (Luật 2)",
      { message: error instanceof Error ? error.message : String(error) },
    );
  }
}

/**
 * Lõi có thể test được cho sự kiện TẠO — nhận alertId + dữ liệu document thô (giống
 * `event.data.after.data()` thật) và deps đã tiêm sẵn. KHÔNG BAO GIỜ ném ra ngoài (Luật 2).
 */
export async function runOnCrisisAlertCreated(
  alertId: string,
  alertData: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
): Promise<void> {
  const outcome = await computeOutcomeSafely(alertData, deps, "initial");
  await writeEmailStatus(deps.db, alertId, outcome);
}

/**
 * Lõi có thể test được cho sự kiện SỬA — Fix round 1, Finding 2: `crisisAlerts` có thể được nâng
 * severity từ "concern" lên "urgent" sau khi mail ban đầu đã gửi (`upgradeCrisisAlert` ở
 * sendChatMessage.ts) — hàm này gửi một mail phản ánh đúng severity mới cho đúng tình huống đó,
 * và KHÔNG làm gì ở mọi tình huống khác.
 *
 * Bất biến chống tự-kích-hoạt-lại: một thay đổi không đụng tới `severity` — kể cả CHÍNH việc
 * `writeEmailStatus` ghi `emailStatus`/`emailedAt` ở cuối hàm này (bản thân đó cũng là một sự
 * kiện "sửa" tiếp theo) — phải return SỚM, không đọc gì thêm, không ghi gì thêm. Nếu không,
 * chính việc ghi trạng thái sẽ tự kích hoạt lại onDocumentWritten vô tận.
 */
export async function runOnCrisisAlertUpdated(
  alertId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  deps: OnCrisisAlertCreatedDeps,
): Promise<void> {
  const beforeSeverity = before.severity === "urgent" ? "urgent" : "concern";
  const afterSeverity = after.severity === "urgent" ? "urgent" : "concern";

  if (beforeSeverity === afterSeverity) return;

  // Chỉ MỘT hướng được coi là "escalation" (ruling coordinator): concern → urgent. severity
  // không bao giờ hạ cấp theo bất biến của sendChatMessage.ts (isMoreSevere/maxSeverity chỉ
  // tăng), nên mọi hướng khác bị bỏ qua ở đây — phòng thủ, không giả định bất biến phía trên
  // đúng mãi mãi.
  if (beforeSeverity !== "concern" || afterSeverity !== "urgent") return;

  // Fix round 2, Finding 1: guard cũ ("chỉ escalate nếu emailStatus === 'sent'") có HAI lỗ hổng
  // coordinator tìm thấy, cùng một chỗ sửa.
  //
  // (a) Gap đã tự flag ở Fix round 1: mail đầu "failed" → severity lên "urgent" → guard cũ chặn
  // → KHÔNG mail nào cho một cảnh báo urgent.
  //
  // (b) Race KHÔNG thấy trước: `before.emailStatus` là trạng thái TẠI THỜI ĐIỂM
  // `upgradeCrisisAlert` ghi — nếu lần ghi `emailStatus` của nhánh TẠO CHƯA xong lúc đó (thực tế:
  // sendChatMessage.ts đợi trọn một lượt suy luận model giữa lúc tạo alert và lúc nâng cấp, cùng
  // bậc thời gian với cold start + listAllAuthUsers phân trang + sendEmail timeout 10s của chính
  // trigger này), field này là `undefined` → guard cũ return sớm — TRONG KHI nhánh TẠO vẫn đang
  // chạy, cầm snapshot "concern" CŨ, sắp gửi "Cần chú ý" rồi ghi "sent". Hộp thư hiểu SAI mức độ
  // VĨNH VIỄN — đúng thất bại Finding 2 (Fix round 1) tồn tại để sửa, tái diễn qua một cửa khác.
  //
  // SỬA (ruling coordinator, Fix round 2) — ba nhánh thay vì một điều kiện:
  const priorEmailStatus = before.emailStatus;

  if (priorEmailStatus === "skipped") {
    // Chủ ý tắt mail (hoặc không có admin) — tôn trọng lựa chọn đó; đánh giá lại chỉ tốn một
    // lượt ghi vô ích (cấu hình rất có thể vẫn y hệt lúc mail đầu chạy).
    return;
  }

  // "sent" → gửi mail CẬP NHẬT (như cũ). "failed" HOẶC THIẾU (undefined — đúng race ở (b)) → gửi
  // mail ĐẦY ĐỦ (kind "initial", đọc `after.severity` nên hiện đúng "Mức độ: Khẩn cấp"), KHÔNG
  // phải "escalation": thân mail escalation nói "Email này THAY THẾ đánh giá mức độ trong email
  // trước đó" — một lời NÓI DỐI khi chưa từng có mail nào tới nơi (case "failed"), hoặc khi mail
  // đó CÓ THỂ đang trên đường đi nhưng chưa xác nhận (case race). KHÔNG có nguy cơ lặp vô tận:
  // severity KHÔNG đổi ở lần ghi trạng thái tiếp theo (đã là "urgent" ở `after`), nên sự kiện SỬA
  // kế tiếp (chính `writeEmailStatus` bên dưới) rơi vào no-op ở đầu hàm này. Cái giá phải trả là
  // khả năng gửi TRÙNG nếu nhánh TẠO thật ra ĐÃ gửi thành công nhưng chưa kịp ghi "sent" khi race
  // xảy ra — ruling "duplicate beats missing" (Fix round 1, việc CỐ Ý không xử lý Eventarc
  // at-least-once) đã chấp nhận đúng đánh đổi này.
  const kind: EmailKind = priorEmailStatus === "sent" ? "escalation" : "initial";

  const outcome = await computeOutcomeSafely(after, deps, kind);
  await writeEmailStatus(deps.db, alertId, outcome);
}

export const onCrisisAlertCreated = onDocumentWritten(
  { document: "crisisAlerts/{alertId}", region: "asia-southeast1", secrets: [resendApiKeySecret] },
  async (event) => {
    if (!event.data) return;
    const afterData = event.data.after.data();
    // Document bị XOÁ (afterData undefined khi !after.exists) — ngoài phạm vi trigger này.
    if (afterData === undefined) return;

    const deps: OnCrisisAlertCreatedDeps = {
      db: getFirestore(),
      listUsers: listAllAuthUsers,
      sendEmail: sendEmailDefault,
      apiKey: resendApiKeySecret.value(),
      now: new Date(),
    };

    const beforeData = event.data.before.data();
    if (beforeData === undefined) {
      // Sự kiện TẠO — mail ban đầu.
      await runOnCrisisAlertCreated(event.params.alertId, afterData, deps);
    } else {
      // Sự kiện SỬA — chỉ concern → urgent mới làm gì; kind (initial/escalation) và no-op được
      // quyết định trong hàm dựa trên `before.emailStatus` (xem Fix round 2, Finding 1).
      await runOnCrisisAlertUpdated(event.params.alertId, beforeData, afterData, deps);
    }
  },
);
