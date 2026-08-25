// Callable ráp năm module thuần (openaiClient, crisisDetector, buildChatPrompt, safetyFilter,
// quota) thành một luồng có bảo vệ. Bản thân file này CỐ Ý mỏng — không logic nghiệp vụ mới
// ngoài phần bóc nhãn lo ngại của Lớp 2 (xem parseConcernLevel bên dưới, thuộc về callable này
// theo đúng phân công của task-5-brief.md, không phải một module thuần Task 3/4). Mọi quyết
// định khác (dựng prompt, gọi model, phát hiện từ khoá, lọc an toàn, tính quota) đã nằm trong
// các module con.
//
// Ráp theo cùng khuôn với generateReflection.ts (Spec #3): cùng region, cùng cách đọc secret
// qua defineSecret, cùng kỷ luật thứ tự guard, cùng cách xử lý lỗi đã khử thông tin nhạy cảm.
//
// ==== Fix round 1 (review từ coordinator) — thứ tự guard đã ĐỔI so với bản đầu ====
//
// Thứ tự MỚI: chưa đăng nhập → email chưa xác thực → input parse → aiOptIn tắt → session
// không tồn tại → session không sở hữu → LỚP 1 (từ khoá) → kill switch → baseUrl rỗng → quota
// → dựng prompt/lịch sử → gọi provider.
//
// Finding 4 (ruling của coordinator): LỚP 1 giờ đứng TRÊN kill switch VÀ baseUrl — một tin
// "urgent" không bao giờ bị từ chối vì lý do VẬN HÀNH (kill switch bật, baseUrl rỗng), chỉ vì
// CRISIS_REPLY_TEXT là một hằng số tĩnh, không tốn gì để phục vụ, và từ chối một học sinh đang
// nguy hiểm vì lý do vận hành là không thể biện minh được. Những gì VẪN đứng trên Lớp 1 là
// consent/authorization (aiOptIn, sở hữu session, đăng nhập) — không phải trạng thái vận hành:
// một học sinh chưa từng đồng ý không ở trong giao diện chat, và ta không đọc một session
// không phải của họ.
//
// Finding 6 (Minor): loadRecentHistory + buildChatMessages giờ đứng TRƯỚC consumeQuota (trước
// đây quota đứng trước, nên một lỗi đọc lịch sử/dựng prompt SAU khi đã trừ quota sẽ đốt một
// lượt mà không có request nào thực sự đi ra ngoài — cùng lý do generateReflection.ts dựng
// prompt trước khi trừ quota). Việc GHI tin nhắn của học sinh vẫn đứng SAU quota — chỉ đọc/dựng
// dữ liệu (không tốn gì, không thể "mất" nếu thất bại) mới được phép đứng trước.
//
// ==== Fix round 2 (review từ coordinator) — Finding 1 CRITICAL, sửa lỗi do round 1 gây ra ====
//
// Round 1 (Finding 5) hoãn việc ghi cảnh báo Lớp 1 "concern" tới SAU khi model trả lời, để gộp
// với Lớp 2 thành một document. Hậu quả không lường trước: từ điểm hoãn đó tới điểm ghi có BA
// throw point (quota, lỗi provider, lọc an toàn) — một tin bị Lớp 1 gắn cờ "concern" nhưng gặp
// bất kỳ throw nào trong ba điểm đó sẽ KHÔNG BAO GIỜ có cảnh báo nào được ghi. Liệu thầy cô có
// nghe được tín hiệu hay không không được phép phụ thuộc vào việc một cuộc gọi HTTP tới bên thứ
// ba có thành công hay không.
//
// SỬA: ghi cảnh báo Lớp 1 NGAY khi phát hiện (như trước round 1) — `layer1AlertId` giữ lại id
// document đó. Lớp 2 (biết được sau khi model trả lời) NÂNG CẤP đúng document đó (severity lên
// mức nặng hơn nếu cần, triggeredBy thành "both") thay vì tạo document mới — vẫn đúng MỘT
// document mỗi tin nhắn (đúng tinh thần Finding 5 round 1), nhưng tín hiệu không bao giờ bị mất
// giữa chừng nữa.
//
// Finding 2 (Important): Lớp 1 "urgent" giờ bỏ qua MỌI phanh vận hành (kill switch, baseUrl,
// quota — Finding 4 round 1) — nghĩa là không gì chặn được việc ghi hàng loạt `crisisAlerts`
// nếu một client gửi liên tục các tin có từ khoá urgent. Một luồng cảnh báo tự nó là một lỗi an
// toàn (rủi ro R6, design spec §9: cảnh báo nhầm quá nhiều khiến thầy cô bỏ qua). Phanh đặt ở
// việc TẠO CẢNH BÁO, KHÔNG BAO GIỜ ở phản hồi cho học sinh — xem hasRecentUnhandledAlert.
//
// ==== Fix round 3 (review từ coordinator) — hai hệ quả của ruling Finding 2 round 2 ====
//
// Finding 1 (Important, an toàn): phanh chống-lụt round 2 chỉ là boolean ("có cảnh báo mở hay
// không") — không xét severity. Hậu quả: một cảnh báo "concern" đang mở, rồi học sinh gửi một
// tin "urgent" trong cùng cửa sổ → bị dedup, cảnh báo VẪN ở mức "concern" — thầy cô được báo,
// nhưng ở SAI mức độ triage. Tệ hơn: nếu Lớp 1 bị dedup (gắn vào cảnh báo cũ) rồi Lớp 2 lại phát
// hiện "urgent", bản round 2 hoàn toàn không ghi gì (layer1AlertId trả về null khi bị dedup, và
// nhánh "tạo mới" ở Lớp 2 cũng bị chính dedup đó chặn) — mất tín hiệu hoàn toàn dù
// combinedSeverity === "urgent" mới là thứ quyết định câu trả lời học sinh nhận được.
//
// SỬA: hasRecentUnhandledAlert đổi thành findRecentUnhandledAlert, trả về id VÀ severity của
// cảnh báo đang mở (không còn boolean) — nếu tín hiệu mới NẶNG HƠN, NÂNG CẤP cảnh báo đó thay vì
// bỏ qua; nếu KHÔNG nặng hơn, giữ nguyên (không hạ cấp) nhưng vẫn trả về id đó để phía trên biết
// "tin nhắn này đang gắn với cảnh báo nào" — đây chính là điều khiến ca "Lớp 1 dedup, Lớp 2 phát
// hiện urgent" giờ nâng cấp đúng document thay vì không ghi gì.
//
// Finding 2 (Important): findRecentUnhandledAlert giờ nằm TRÊN đường ghi CRISIS_REPLY_TEXT của
// nhánh urgent — một lỗi truy vấn (vd. composite index chưa build kịp lúc mới deploy) sẽ làm
// hỏng cả lượt gọi, đúng thứ Finding 4 (round 1) tồn tại để ngăn. FAIL OPEN: mọi lỗi từ
// findRecentUnhandledAlert đều bị nuốt, coi như "không tìm thấy cảnh báo nào" — tạo cảnh báo
// mới (chấp nhận trùng) thay vì làm hỏng phản hồi cho một học sinh đang khủng hoảng.

/** Cửa sổ thời gian coi một cảnh báo CHƯA XỬ LÝ là "vẫn còn mới" — trong cửa sổ này, một cảnh
 *  báo thứ hai cho ĐÚNG học sinh đó không được tạo thêm (Fix round 2, Finding 2). "Vài phút" là
 *  khoảng đủ để không tạo ra hai document cho hai tin nhắn liên tiếp trong CÙNG một đợt bộc lộ
 *  khủng hoảng, nhưng không quá dài để một tình huống thật sự MỚI (nhiều phút sau, có thể sau khi
 *  thầy cô đã bắt đầu can thiệp ngoài hệ thống) vẫn tạo được cảnh báo riêng nếu cảnh báo cũ chưa
 *  kịp đánh dấu đã xử lý. CỐ Ý không phải rate limit lên học sinh: tin nhắn của em vẫn được lưu,
 *  CRISIS_REPLY_TEXT vẫn được trả về bình thường mọi lúc — chỉ việc TẠO CẢNH BÁO bị phanh lại.*/
const CRISIS_ALERT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { aiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from "./config";
import {
  callChatCompletion as callChatCompletionDefault,
  AiProviderError,
  type ChatCompletionResult,
} from "./openaiClient";
import {
  buildChatMessages,
  CRISIS_REPLY_TEXT,
  CONCERN_LEVEL_LABEL,
  CONCERN_LEVEL_VALUES,
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_WINDOW_SIZE,
  type ChatTurnPromptInput,
} from "./buildChatPrompt";
import { detectCrisisKeywords } from "./crisisDetector";
import { checkOutputSafety } from "./safetyFilter";
import { consumeQuota } from "./quota";

/** Secret chứa API key của AI provider — KHÔNG BAO GIỜ đọc từ process.env trực tiếp. Khai
 *  báo trong `secrets: [...]` của onCall để Cloud Functions bơm giá trị vào runtime. */
const aiApiKeySecret = defineSecret("EXAMCALM_AI_API_KEY");

/** Timeout cho một lượt gọi model — cùng giá trị với generateReflection.ts. */
const AI_REQUEST_TIMEOUT_MS = 30_000;

/** Fix round 1, Finding 7: "default" trùng với sentinel promptTemplateId của generateReflection.ts
 *  khi CHƯA có promptTemplates nào publish — một dòng aiSafetyLog không phân biệt được đây là
 *  một phản chiếu hay một tin chat bị chặn. Hậu tố "_chat" tách hai nguồn ra, không đổi gì ở
 *  generateReflection.ts (sentinel của nó vẫn là "default"). */
const DEFAULT_CHAT_PROMPT_TEMPLATE_ID = "default_chat";

const inputSchema = z.object({
  sessionId: z.string().min(1),
  // Fix round 1, Finding 8: .min(1) chỉ chặn chuỗi RỖNG, không chặn chuỗi CHỈ TOÀN khoảng
  // trắng ("   ") — chuỗi đó vẫn có length >= 1 nên qua được .min(1), rồi đi thẳng ra provider
  // (tốn một lượt gọi thật, một dòng quota, cho một tin không mang nội dung gì). refine() thêm
  // kiểm tra sau khi trim — không transform (không đổi text lưu xuống DB), chỉ từ chối input.
  text: z
    .string()
    .min(1)
    .max(CHAT_MESSAGE_MAX_CHARS)
    .refine((s) => s.trim().length > 0, {
      message: "Nội dung tin nhắn không được chỉ chứa khoảng trắng.",
    }),
});

/** Thông điệp lỗi trả về client cho MỌI lỗi phát sinh sau khi đã gọi (hoặc thử gọi) model —
 *  cùng lý do với GENERIC_MODEL_FAILURE_MESSAGE của generateReflection.ts: không tiết lộ
 *  baseUrl, model, API key, hay lý do nội bộ nào cho học sinh. */
const GENERIC_MODEL_FAILURE_MESSAGE = "Không thể trả lời lúc này, thử lại sau nhé.";

export type SendChatMessageCallerAuth = { uid: string; emailVerified: boolean } | undefined;

export type SendChatMessageDeps = {
  db: Firestore;
  /** Mốc thời gian dùng cho quota — nhận qua tham số (không gọi `new Date()` trong hàm) để
   *  test kiểm soát được khoá ngày giờ VN một cách xác định. */
  now: Date;
  apiKey: string;
  callChatCompletion: (
    ...args: Parameters<typeof callChatCompletionDefault>
  ) => Promise<ChatCompletionResult>;
};

export type SendChatMessageResult = { messageId: string };

/** Đọc `systemConfig/aiConfig`. Cùng hành vi với loadAiConfig của generateReflection.ts — doc
 *  thiếu hoặc sai hình dạng đều coi như "chưa cấu hình" (an toàn cho học sinh), nhưng log lại
 *  ĐƯỜNG DẪN field sai (không phải giá trị) để admin biết vì sao tính năng "tự nhiên" tắt. */
async function loadAiConfig(db: Firestore): Promise<AiConfig> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;

  const parsed = aiConfigSchema.safeParse(snap.data());
  if (!parsed.success) {
    console.error("systemConfig/aiConfig không hợp lệ, dùng cấu hình mặc định (an toàn)", {
      paths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return DEFAULT_AI_CONFIG;
  }
  return parsed.data;
}

type NewChatMessage = {
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  isCrisisResponse: boolean;
};

/** Ghi một tin nhắn mới vào `chatMessages` VÀ cập nhật `lastMessageAt`/`messageCount` của
 *  `chatSessions` cha trong cùng một lượt gọi — mọi tin (của học sinh hay của trợ lý) đều đi
 *  qua đúng một điểm này, để hai collection không bao giờ lệch nhau (design spec §4). */
async function appendChatMessage(
  db: Firestore,
  sessionId: string,
  message: NewChatMessage,
): Promise<string> {
  const ref = await db.collection("chatMessages").add({
    ...message,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection("chatSessions").doc(sessionId).update({
    lastMessageAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
  });
  return ref.id;
}

/** Cảnh báo CHƯA XỬ LÝ gần nhất (nếu có) cho ĐÚNG `userId`, trong `CRISIS_ALERT_DEDUP_WINDOW_MS`
 *  gần nhất. Fix round 3, Finding 1: trả về id VÀ severity (không còn boolean) — caller cần
 *  severity để quyết định NÂNG CẤP hay giữ nguyên, và cần id dù KHÔNG nâng cấp (để biết tin
 *  nhắn hiện tại đang "gắn" với cảnh báo nào, cho khả năng Lớp 2 nâng cấp nó sau này). */
async function findRecentUnhandledAlert(
  db: Firestore,
  userId: string,
  now: Date,
): Promise<{ id: string; severity: "urgent" | "concern" } | null> {
  const windowStart = Timestamp.fromDate(new Date(now.getTime() - CRISIS_ALERT_DEDUP_WINDOW_MS));
  const snap = await db
    .collection("crisisAlerts")
    .where("userId", "==", userId)
    .where("handledBy", "==", null)
    .where("createdAt", ">=", windowStart)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, severity: doc.data().severity as "urgent" | "concern" };
}

/** true nếu `a` nghiêm trọng hơn THẬT SỰ `b` — chỉ hai mức nên so sánh trực tiếp thay vì tái
 *  dùng `maxSeverity` (maxSeverity còn phải nhận `null`; ở đây cả hai vế luôn đã là giá trị cụ
 *  thể của một cảnh báo có thật). */
function isMoreSevere(a: "urgent" | "concern", b: "urgent" | "concern"): boolean {
  return a === "urgent" && b === "concern";
}

/**
 * Ghi (hoặc GẮN VÀO) một cảnh báo khủng hoảng — CHỈ đúng sáu field cho phép (design spec §3.4,
 * non-negotiable của task-5-brief.md): không bao giờ messageText, trích đoạn, hay tóm tắt nào
 * lọt vào đây. LUÔN trả về id của document đang đại diện cho tín hiệu này (Fix round 3, Finding
 * 1 — không còn trả `null` khi bị dedup): document MỚI nếu không có cảnh báo chưa xử lý nào gần
 * đây, hoặc document ĐÃ CÓ nếu tìm thấy. Nếu tín hiệu MỚI nghiêm trọng hơn cảnh báo đã có, NÂNG
 * CẤP severity/triggeredBy của nó thay vì bỏ qua — dedup vẫn giữ đúng nghĩa "một document mỗi
 * đợt", nhưng tín hiệu NẶNG NHẤT trong đợt đó phải thắng, không phải tín hiệu ĐẦU TIÊN. Nếu tín
 * hiệu mới KHÔNG nghiêm trọng hơn, cảnh báo đã có được giữ nguyên (không hạ cấp) — chỉ id của nó
 * được trả về.
 *
 * Fix round 3, Finding 2: findRecentUnhandledAlert nằm TRÊN đường ghi CRISIS_REPLY_TEXT của
 * nhánh Lớp 1 "urgent" — một lỗi truy vấn (vd. composite index chưa build kịp lúc mới deploy)
 * không được phép làm hỏng cả lượt gọi. FAIL OPEN: mọi lỗi từ bước tìm cảnh báo cũ đều bị nuốt
 * (log lại để chẩn đoán được, không kèm uid — cùng kỷ luật với các console.error khác trong
 * file này), coi như "không tìm thấy cảnh báo nào" — tạo cảnh báo mới. Một cảnh báo trùng chấp
 * nhận được; một học sinh đang khủng hoảng không nhận được câu trả lời thì không.
 */
async function writeCrisisAlert(
  db: Firestore,
  userId: string,
  severity: "urgent" | "concern",
  triggeredBy: "keyword" | "model" | "both",
  now: Date,
): Promise<string> {
  let existing: { id: string; severity: "urgent" | "concern" } | null = null;
  try {
    existing = await findRecentUnhandledAlert(db, userId, now);
  } catch (error) {
    console.error(
      "sendChatMessage: findRecentUnhandledAlert thất bại — fail-open, vẫn tạo cảnh báo mới",
      { message: error instanceof Error ? error.message : String(error) },
    );
    existing = null;
  }

  if (existing === null) {
    const ref = await db.collection("crisisAlerts").add({
      userId,
      severity,
      triggeredBy,
      // `Timestamp.fromDate(now)` — KHÔNG dùng FieldValue.serverTimestamp() (khác với
      // appendChatMessage): findRecentUnhandledAlert so `createdAt` với một cửa sổ tính từ CHÍNH
      // `now` này — hai đồng hồ khác nhau khiến so sánh cửa sổ vô nghĩa (Fix round 2, Finding 2).
      createdAt: Timestamp.fromDate(now),
      handledBy: null,
      handledAt: null,
    });
    return ref.id;
  }

  if (isMoreSevere(severity, existing.severity)) {
    await db.collection("crisisAlerts").doc(existing.id).update({ severity, triggeredBy });
  }
  return existing.id;
}

/** NÂNG CẤP một cảnh báo Lớp 1 đã ghi TRƯỚC đó (id đã biết) lên mức độ NẶNG HƠN kèm
 *  `triggeredBy: "both"` — dùng khi Lớp 2 (biết được sau khi model trả lời) cũng phát tín hiệu
 *  trên CHÍNH tin nhắn đã tạo alert đó (Fix round 2, Finding 1). KHÔNG đi qua
 *  hasRecentUnhandledAlert: đây không phải tạo một document mới, mà hoàn thiện đúng một document
 *  đã tồn tại cho đúng tin nhắn này — phanh chống-lụt (Finding 2) chỉ áp cho việc TẠO mới. */
async function upgradeCrisisAlert(
  db: Firestore,
  alertId: string,
  severity: "urgent" | "concern",
): Promise<void> {
  await db.collection("crisisAlerts").doc(alertId).update({
    severity,
    triggeredBy: "both",
  });
}

/** Đọc `CHAT_WINDOW_SIZE` lượt gần nhất của một session, trả về theo thứ tự thời gian TĂNG DẦN
 *  (cũ → mới) — đúng thứ tự `buildChatMessages` mong đợi. Đọc TRƯỚC khi ghi tin mới của học
 *  sinh (thứ tự bắt buộc trong hàm chính bên dưới): nếu đọc SAU, tin vừa ghi sẽ lẫn vào chính
 *  cửa sổ lịch sử của nó, vừa lặp nội dung vừa chiếm mất một chỗ trong cửa sổ có trần. */
async function loadRecentHistory(
  db: Firestore,
  sessionId: string,
): Promise<ChatTurnPromptInput[]> {
  const snap = await db
    .collection("chatMessages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "desc")
    .limit(CHAT_WINDOW_SIZE)
    .get();

  return snap.docs.reverse().map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return { role: data.role, text: data.text } as ChatTurnPromptInput;
  });
}

// ---- Lớp 2: bóc nhãn mức độ lo ngại model tự trả kèm câu trả lời ----
//
// LOAD-BEARING (task-5-brief.md, "Design decisions you inherit", mục 2): parser XÁC ĐỊNH MỨC
// ĐỘ (buildConcernLabelLinePattern) PHẢI khớp đúng NGUYÊN VĂN CONCERN_LEVEL_LABEL (không phải
// một bản `\s+`-hoá giữa các từ như crisisDetector.ts làm với từ khoá của nó), lấy khớp CUỐI
// CÙNG, và neo vào đầu dòng. Lý do: Task 4 chỉ khử được literal CHÍNH XÁC của nhãn khỏi tin
// nhắn học sinh trước khi gửi cho model (`neutralizeConcernLabel` ở buildChatPrompt.ts) — một
// biến thể khoảng trắng (hai dấu cách giữa "MỨC" và "ĐỘ", NBSP, tab, xuống dòng giữa nhãn, dấu
// cách trước dấu hai chấm) SỐNG SÓT qua bước khử đó và có thể xuất hiện lại nguyên văn trong
// `result.text` (nếu model trích dẫn lại tin nhắn học sinh). Nếu parser MỨC ĐỘ khoan dung với
// các biến thể đó, một học sinh có thể tự chèn một nhãn giả để che khuất nhãn THẬT model tự
// thêm ở cuối — im lặng hoá đúng Lớp 2, đúng lúc Lớp 2 tồn tại để bắt những gì Lớp 1 đã bỏ sót.
//
// Fix round 1, Finding 3 (Important — review từ coordinator): bản đầu dùng CHUNG một pattern
// strict để vừa xác định mức độ VỪA bóc nhãn khỏi văn bản hiển thị — nghĩa là một dòng nhãn
// SAI ĐỊNH DẠNG (dấu chấm cuối câu, giá trị viết hoa, có gạch đầu dòng, "***" thay vì "**") vừa
// fail-closed đúng như thiết kế (mức 3, không đoán mò), VỪA không bị bóc khỏi văn bản — học
// sinh đọc thẳng "MỨC ĐỘ LO NGẠI: Urgent" ở cuối một câu trả lời ấm áp, một control token dạy
// chính các em cách "gõ" để né bộ lọc. Sửa: TÁCH hai việc. buildConcernLabelLinePattern (strict)
// CHỈ dùng để xác định `level` — không đổi. buildConcernLabelStripPattern (khoan dung hơn) CHỈ
// dùng để bóc nhãn khỏi văn bản hiển thị — vẫn đòi đúng NGUYÊN VĂN nhãn (an toàn theo đúng lập
// luận file này đã dùng cho neutralizeConcernLabel: tin nhắn học sinh không thể chứa nguyên văn
// nhãn vì đã bị khử ở input, nên một stripper khoan dung hơn ở phần ĐUÔI dòng không thể "giấu"
// nội dung của học sinh), nhưng bỏ qua mọi thứ SAU nhãn trên cùng dòng — dấu chấm, hoa/thường,
// hay bất kỳ ký tự nào khác đều bị nuốt cùng.
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Dựng regex khớp một DÒNG nhãn hợp lệ — neo đầu dòng, cho phép markdown bold và khoảng trắng
 *  bọc quanh nhãn/giá trị, đòi giá trị phải là CHÍNH XÁC một trong CONCERN_LEVEL_VALUES, và
 *  không cho phép nội dung nào khác trên cùng dòng. Instance MỚI mỗi lần gọi (không tái dùng
 *  một RegExp có flag "g" giữa các lệnh gọi — lastIndex sẽ làm sai kết quả lần sau). CHỈ dùng
 *  để xác định `level` — xem comment lớn ở trên. */
function buildConcernLabelLinePattern(): RegExp {
  const label = escapeRegExp(CONCERN_LEVEL_LABEL);
  const values = CONCERN_LEVEL_VALUES.join("|");
  return new RegExp(`^[ \\t]*\\*{0,2}${label}\\*{0,2}[ \\t]*(${values})[ \\t]*\\*{0,2}[ \\t]*$`, "gm");
}

/** Dựng regex BÓC (không xác định mức độ) một dòng nhãn — đòi đúng NGUYÊN VĂN nhãn (không nới
 *  lỏng phần này, cùng lý do buildConcernLabelLinePattern), nhưng khoan dung phần ĐẦU dòng
 *  (gạch đầu dòng/bullet, tối đa 4 dấu "*" markdown thay vì 2) và nuốt TOÀN BỘ phần còn lại của
 *  dòng sau nhãn (`.*`) — dấu câu, hoa/thường, hay bất kỳ nội dung nào khác không cản việc bóc.
 *  Fix round 1, Finding 3. */
function buildConcernLabelStripPattern(): RegExp {
  const label = escapeRegExp(CONCERN_LEVEL_LABEL);
  return new RegExp(`^[ \\t]*(?:[-•]\\s*)?\\*{0,4}${label}.*$`, "gm");
}

type ConcernLevel = (typeof CONCERN_LEVEL_VALUES)[number];

type ParsedConcernLevel = {
  /** null = không tìm thấy dòng nhãn ĐÚNG ĐỊNH DẠNG nào (thiếu, hoặc mọi ứng viên đều sai
   *  định dạng) — caller PHẢI fail-closed về "concern" (mục 3, task-5-brief.md), không được
   *  coi là "none". */
  level: ConcernLevel | null;
  /** Văn bản đã loại bỏ MỌI dòng khớp nhãn (kể cả sai định dạng giá trị, kể cả bị lặp lại) —
   *  an toàn để hiển thị thẳng cho học sinh (mục 4, task-5-brief.md; Fix round 1, Finding 3). */
  strippedText: string;
};

function parseConcernLevel(rawText: string): ParsedConcernLevel {
  const normalized = rawText.normalize("NFC");
  const matches = Array.from(normalized.matchAll(buildConcernLabelLinePattern()));
  const strippedText = normalized.replace(buildConcernLabelStripPattern(), "").trim();

  if (matches.length === 0) {
    return { level: null, strippedText };
  }

  // Lấy khớp CUỐI CÙNG: nếu văn bản có nhiều dòng nhãn hợp lệ (model lặp lại, hoặc một dòng
  // sớm hơn tình cờ khớp), dòng model thực sự dùng để kết thúc câu trả lời (theo đúng chỉ dẫn
  // "Ở CUỐI câu trả lời" trong system prompt) mới là kết quả đáng tin. KHÔNG đổi hành vi này
  // (ruling của coordinator, Fix round 1): lấy khớp ĐẦU sẽ mở lại đường một học sinh dụ model
  // tái sinh một nhãn giả thứ hai để che nhãn thật.
  const lastMatch = matches[matches.length - 1];
  return { level: lastMatch[1] as ConcernLevel, strippedText };
}

/** Mức độ nghiêm trọng nội bộ dùng để gộp kết quả hai lớp — `null` nghĩa là "không có tín hiệu
 *  gì từ lớp đó", KHÁC với severity `"concern"`/`"urgent"` ghi vào crisisAlerts. */
type InternalSeverity = "urgent" | "concern" | null;

/**
 * Mức độ NẶNG HƠN giữa hai severity nội bộ — urgent > concern > null. Hàm THUẦN, tính đúng MAX
 * thật sự (Fix round 2, Finding 3 — Minor): bản round 1 (`resolveCrisisOutcome`) chỉ đặc cách
 * `layer2Severity === "urgent"`, đúng với bất biến hiện tại "layer1 không bao giờ là 'urgent'
 * khi tới đoạn gộp này" (vì "urgent" đã return sớm ở nhánh riêng) nhưng không TỰ nó đúng nếu bất
 * biến đó bị phá vỡ sau này — hàm không nên dựa vào một điều caller phải tự nhớ giữ đúng.
 */
function maxSeverity(a: InternalSeverity, b: InternalSeverity): InternalSeverity {
  if (a === "urgent" || b === "urgent") return "urgent";
  if (a === "concern" || b === "concern") return "concern";
  return null;
}

/**
 * Lõi có thể test được của callable — nhận auth/data/deps đã bóc tách sẵn, không phụ thuộc
 * runtime thật của Cloud Functions. Ném HttpsError trực tiếp để test gọi thẳng hàm này với
 * Firestore emulator và một callChatCompletion giả.
 */
export async function runSendChatMessage(
  auth: SendChatMessageCallerAuth,
  data: unknown,
  deps: SendChatMessageDeps,
): Promise<SendChatMessageResult> {
  // 1. Chưa đăng nhập.
  if (!auth) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập để dùng tính năng này.");
  }

  // 2. Email chưa xác thực.
  if (!auth.emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Bạn cần xác thực email trước khi dùng tính năng này.",
      { reason: "email_unverified" },
    );
  }

  const parsedInput = inputSchema.safeParse(data);
  if (!parsedInput.success) {
    throw new HttpsError("invalid-argument", "Thiếu sessionId hoặc nội dung tin nhắn hợp lệ.");
  }
  const { sessionId, text } = parsedInput.data;

  // 3. aiOptIn — lời hứa riêng tư cốt lõi. Đứng TRÊN việc đọc session: đây là consent, không
  // phải trạng thái vận hành (Fix round 1, Finding 4 — chỉ các gate VẬN HÀNH mới lùi xuống
  // dưới Lớp 1, không phải consent/authorization).
  const userSnap = await deps.db.collection("users").doc(auth.uid).get();
  const aiOptIn = userSnap.exists && userSnap.data()?.privacySettings?.aiOptIn === true;
  if (!aiOptIn) {
    throw new HttpsError(
      "permission-denied",
      "Bạn cần bật đồng ý dùng tính năng AI trong phần cài đặt riêng tư trước.",
      { reason: "ai_opt_in" },
    );
  }

  // 4/5. session phải tồn tại VÀ thuộc về đúng người gọi — callable chạy bằng Admin SDK nên
  // Security Rules không bảo vệ, phải tự so sánh userId.
  const sessionRef = deps.db.collection("chatSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Không tìm thấy phiên trò chuyện này.");
  }
  const sessionData = sessionSnap.data() as Record<string, unknown>;
  if (sessionData.userId !== auth.uid) {
    // CỐ Ý không kèm `details` — cùng lý do với generateReflection.ts: một discriminator riêng
    // cho nhánh này sẽ xác nhận document TỒN TẠI và thuộc về người khác.
    throw new HttpsError("permission-denied", "Bạn không có quyền truy cập phiên trò chuyện này.");
  }

  // 6. Lớp 1 — từ khoá, chạy TRƯỚC MỌI gate vận hành (kill switch, baseUrl, quota — Fix round 1,
  // Finding 4). "urgent" trả thẳng CRISIS_REPLY_TEXT — KHÔNG cần đọc aiConfig, KHÔNG gọi model,
  // KHÔNG trừ quota: một hằng số tĩnh không tốn gì để phục vụ ngay cả khi kill switch bật hay
  // baseUrl rỗng.
  const layer1 = detectCrisisKeywords(text);
  if (layer1.severity === "urgent") {
    // Fix round 2, Finding 2: writeCrisisAlert tự phanh nếu đã có cảnh báo chưa xử lý gần đây
    // cho đúng học sinh này — tin nhắn vẫn được lưu và CRISIS_REPLY_TEXT vẫn được trả về BÌNH
    // THƯỜNG dù không có document cảnh báo mới nào được tạo.
    await writeCrisisAlert(deps.db, auth.uid, "urgent", "keyword", deps.now);
    await appendChatMessage(deps.db, sessionId, {
      userId: auth.uid,
      sessionId,
      role: "user",
      text,
      isCrisisResponse: false,
    });
    const assistantMessageId = await appendChatMessage(deps.db, sessionId, {
      userId: auth.uid,
      sessionId,
      role: "assistant",
      text: CRISIS_REPLY_TEXT,
      isCrisisResponse: true,
    });
    return { messageId: assistantMessageId };
  }
  // "concern" — Fix round 2, Finding 1 (CRITICAL, sửa lỗi round 1 gây ra): ghi NGAY, không hoãn
  // tới sau khi gọi model nữa. `layer1AlertId` giữ id document — LUÔN là id thật (document mới
  // HOẶC document đã có mà tin nhắn này được "gắn" vào, xem writeCrisisAlert; Fix round 3,
  // Finding 1: không còn null khi bị dedup) khi Lớp 1 phát hiện gì đó; chỉ null nếu Lớp 1 không
  // phát hiện gì. Lớp 2 dùng id này để nâng cấp đúng document đó sau này thay vì tạo document
  // thứ hai — kể cả khi document đó không phải do CHÍNH tin nhắn này tạo ra.
  const layer1Severity: InternalSeverity = layer1.severity === "concern" ? "concern" : null;
  const layer1AlertId =
    layer1Severity !== null
      ? await writeCrisisAlert(deps.db, auth.uid, "concern", "keyword", deps.now)
      : null;

  const config = await loadAiConfig(deps.db);

  // 7. Kill switch RIÊNG cho chat (Fix round 1, Finding 2b) — độc lập với killSwitch.moodReflection.
  if (config.killSwitch.chat) {
    throw new HttpsError("failed-precondition", "Tính năng trò chuyện AI hiện đang tắt.");
  }

  // 8. baseUrl chưa cấu hình — trạng thái mặc định của hệ thống là im lặng.
  if (config.baseUrl === "") {
    throw new HttpsError("failed-precondition", "Tính năng trò chuyện AI chưa sẵn sàng.");
  }

  // Đọc lịch sử + dựng messages TRƯỚC quota (Fix round 1, Finding 6) — một lỗi đọc/dựng không
  // tốn gì thật, nên không được phép đứng SAU điểm trừ quota (đối xứng với generateReflection.ts
  // dựng prompt trước khi trừ quota). Đọc lịch sử vẫn đứng TRƯỚC khi ghi tin mới của học sinh
  // (xem comment của loadRecentHistory) — tin vừa ghi không được lẫn vào chính cửa sổ của nó.
  const history = await loadRecentHistory(deps.db, sessionId);
  const messages = buildChatMessages(history, text);

  // 9. Quota — RIÊNG cho chat (Fix round 1, Finding 1 + 2a): khoá document tách biệt với
  // reflection (`aiUsage/{uid}_chat_{date}`), và ngưỡng rate limit RIÊNG (chatRateLimitPerMinute)
  // — rateLimitPerMinute của reflection (mặc định 3 = 20 giây/lượt) sẽ là ngưỡng chi phối sai
  // cho một cuộc trò chuyện nếu dùng chung.
  const quota = await consumeQuota(
    deps.db,
    auth.uid,
    "chat",
    { quotaStudentPerDay: config.chatQuotaPerDay, rateLimitPerMinute: config.chatRateLimitPerMinute },
    deps.now,
  );
  if (!quota.allowed) {
    // Fix round 1, Finding 2a: thông điệp RIÊNG cho rate limit — "hết lượt hôm nay" sai bản
    // chất khi lý do thực sự là "gửi hơi nhanh", và rate limit là ngưỡng CHI PHỐI với chat
    // (chatRateLimitPerMinute mặc định 20/phút, tức 3 giây/tin) trong khi quota ngày hiếm khi
    // chạm tới trước rate limit.
    if (quota.reason === "rate_limit") {
      throw new HttpsError(
        "resource-exhausted",
        "Bạn đang gửi tin hơi nhanh, chờ một chút rồi gửi lại nhé.",
      );
    }
    throw new HttpsError(
      "resource-exhausted",
      "Bạn đã dùng hết lượt trò chuyện AI hôm nay, thử lại sau nhé.",
    );
  }

  await appendChatMessage(deps.db, sessionId, {
    userId: auth.uid,
    sessionId,
    role: "user",
    text,
    isCrisisResponse: false,
  });

  let result: ChatCompletionResult;
  try {
    result = await deps.callChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: deps.apiKey,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      // KHÔNG đưa error.message (có thể chứa status code, gợi ý baseUrl) vào lỗi trả về
      // client — chỉ log nội bộ `kind`, không log uid (cùng lý do generateReflection.ts).
      console.error("sendChatMessage: callChatCompletion thất bại", { kind: error.kind });
      throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
    }
    throw error;
  }

  // Lọc an toàn chạy trên TOÀN BỘ văn bản thô, TRƯỚC khi bóc nhãn Lớp 2 — model có thể chèn
  // ngôn ngữ chẩn đoán ở phần mở đầu, và nhãn mức độ lo ngại không trùng bất kỳ từ cấm nào
  // (đã kiểm tra thủ công ở buildChatPrompt.ts) nên không tự kích hoạt bộ lọc.
  const safety = checkOutputSafety(result.text);
  if (!safety.safe) {
    await deps.db.collection("aiSafetyLog").add({
      triggeredKeyword: safety.keyword ?? "(không xác định — văn bản rỗng)",
      model: config.model,
      promptTemplateId: DEFAULT_CHAT_PROMPT_TEMPLATE_ID,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
  }

  // Lớp 2 — model tự đánh giá. "concern" — kể cả fail-closed do nhãn thiếu/sai định dạng (mục
  // 3, task-5-brief.md) — ánh xạ vào InternalSeverity "concern" để gộp cùng Lớp 1.
  const parsedConcern = parseConcernLevel(result.text);
  const layer2Severity: InternalSeverity =
    parsedConcern.level === "urgent"
      ? "urgent"
      : parsedConcern.level === "concern" || parsedConcern.level === null
        ? "concern"
        : null; // "none" — không có tín hiệu

  // Fix round 2, Finding 1: KHÔNG còn tạo document ở đây khi Lớp 1 đã ghi một cái rồi — NÂNG
  // CẤP đúng document đó (severity lên mức nặng hơn nếu cần, triggeredBy thành "both"). Chỉ tạo
  // document MỚI nếu Lớp 1 không phát hiện gì (layer1AlertId === null) và Lớp 2 có tín hiệu.
  const combinedSeverity = maxSeverity(layer1Severity, layer2Severity);
  if (layer1AlertId !== null) {
    if (layer2Severity !== null) {
      await upgradeCrisisAlert(deps.db, layer1AlertId, combinedSeverity!);
    }
    // else: Lớp 2 không có tín hiệu gì ("none") — để nguyên document Lớp 1 đã ghi
    // (severity="concern", triggeredBy="keyword"), không cần đụng vào.
  } else if (layer2Severity !== null) {
    // Lớp 1 không phát hiện gì — document (nếu có) hoàn toàn do Lớp 2 tạo ra.
    await writeCrisisAlert(deps.db, auth.uid, layer2Severity, "model", deps.now);
  }

  // Chỉ "urgent" (từ Lớp 2, vì Lớp 1 "urgent" đã return sớm ở trên) mới ghi đè bằng
  // CRISIS_REPLY_TEXT — đối xứng với Lớp 1: chỉ urgent mới dừng vai bạn tâm sự. "concern" —
  // kể cả khi gộp từ cả hai lớp ("both") — vẫn dùng thẳng câu trả lời thật của model, đã bóc
  // nhãn khỏi phần hiển thị cho học sinh.
  let assistantText: string;
  let isCrisisResponse: boolean;

  if (combinedSeverity === "urgent") {
    assistantText = CRISIS_REPLY_TEXT;
    isCrisisResponse = true;
  } else {
    if (parsedConcern.strippedText === "") {
      // Cùng triết lý "không đoán mò" của parseReflectionOutput: một câu trả lời rỗng sau khi
      // bóc nhãn (model chỉ trả đúng dòng nhãn, không có nội dung nào khác) không đáng tin để
      // hiển thị hay lưu — coi như output hỏng.
      throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
    }
    assistantText = parsedConcern.strippedText;
    isCrisisResponse = false;
  }

  const assistantMessageId = await appendChatMessage(deps.db, sessionId, {
    userId: auth.uid,
    sessionId,
    role: "assistant",
    text: assistantText,
    isCrisisResponse,
  });

  return { messageId: assistantMessageId };
}

export const sendChatMessage = onCall(
  { region: "asia-southeast1", secrets: [aiApiKeySecret] },
  async (request) => {
    const auth = request.auth
      ? { uid: request.auth.uid, emailVerified: request.auth.token.email_verified === true }
      : undefined;

    return runSendChatMessage(auth, request.data, {
      db: getFirestore(),
      now: new Date(),
      apiKey: aiApiKeySecret.value(),
      callChatCompletion: callChatCompletionDefault,
    });
  },
);
