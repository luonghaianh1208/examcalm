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

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
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

/** Ghi một cảnh báo khủng hoảng — CHỈ đúng sáu field cho phép (design spec §3.4, non-negotiable
 *  của task-5-brief.md): không bao giờ messageText, trích đoạn, hay tóm tắt nào lọt vào đây.
 *  `triggeredBy` giờ có thêm giá trị "both" (Fix round 1, Finding 5) — xem
 *  `resolveCrisisOutcome` bên dưới, nơi DUY NHẤT quyết định giá trị nào được truyền vào đây. */
async function writeCrisisAlert(
  db: Firestore,
  userId: string,
  severity: "urgent" | "concern",
  triggeredBy: "keyword" | "model" | "both",
): Promise<void> {
  await db.collection("crisisAlerts").add({
    userId,
    severity,
    triggeredBy,
    createdAt: FieldValue.serverTimestamp(),
    handledBy: null,
    handledAt: null,
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

type CrisisOutcome = {
  /** null = không lớp nào phát tín hiệu — không ghi cảnh báo nào. */
  severity: "urgent" | "concern" | null;
  triggeredBy: "keyword" | "model" | "both" | null;
};

/**
 * Fix round 1, Finding 5 (ruling của coordinator): gộp kết quả Lớp 1 (đã biết TRƯỚC khi gọi
 * model — chỉ có thể là "concern" hoặc không có gì, vì "urgent" đã return sớm ở nhánh riêng)
 * và Lớp 2 (chỉ biết SAU khi model trả lời) thành ĐÚNG MỘT quyết định — thay vì mỗi lớp tự ghi
 * một document `crisisAlerts` riêng như bản đầu. Trước fix, một tin vừa khớp từ khoá "concern"
 * VỪA khiến model tự chấm "concern" tạo ra HAI document cách nhau vài trăm mili-giây, không có
 * cách nào phân biệt với hai tin nhắn riêng biệt — và `triggeredBy: "both"` không bao giờ được
 * dùng tới dù đã có sẵn trong schema.
 *
 * Mức độ gộp lấy giá trị NẶNG HƠN (urgent > concern > không có gì) — over-inclusive đúng
 * hướng đã chọn cho toàn bộ đường xử lý khủng hoảng (§3.2 design spec).
 */
function resolveCrisisOutcome(
  layer1Severity: InternalSeverity,
  layer2Severity: InternalSeverity,
): CrisisOutcome {
  const layer1Fired = layer1Severity !== null;
  const layer2Fired = layer2Severity !== null;

  let severity: "urgent" | "concern" | null = null;
  if (layer2Severity === "urgent") {
    severity = "urgent";
  } else if (layer1Fired || layer2Severity === "concern") {
    severity = "concern";
  }

  let triggeredBy: "keyword" | "model" | "both" | null = null;
  if (layer1Fired && layer2Fired) triggeredBy = "both";
  else if (layer1Fired) triggeredBy = "keyword";
  else if (layer2Fired) triggeredBy = "model";

  return { severity, triggeredBy };
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
    await writeCrisisAlert(deps.db, auth.uid, "urgent", "keyword");
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
  // "concern" — KHÔNG ghi alert ngay ở đây nữa (Fix round 1, Finding 5): nhớ lại để GỘP với
  // kết quả Lớp 2 (chỉ biết được sau khi gọi model) thành đúng MỘT document.
  const layer1Severity: InternalSeverity = layer1.severity === "concern" ? "concern" : null;

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

  // Fix round 1, Finding 5: MỘT quyết định gộp, MỘT document (nếu có tín hiệu) — thay vì mỗi
  // lớp tự ghi.
  const outcome = resolveCrisisOutcome(layer1Severity, layer2Severity);
  if (outcome.severity !== null) {
    await writeCrisisAlert(deps.db, auth.uid, outcome.severity, outcome.triggeredBy!);
  }

  // Chỉ "urgent" (từ Lớp 2, vì Lớp 1 "urgent" đã return sớm ở trên) mới ghi đè bằng
  // CRISIS_REPLY_TEXT — đối xứng với Lớp 1: chỉ urgent mới dừng vai bạn tâm sự. "concern" —
  // kể cả khi gộp từ cả hai lớp ("both") — vẫn dùng thẳng câu trả lời thật của model, đã bóc
  // nhãn khỏi phần hiển thị cho học sinh.
  let assistantText: string;
  let isCrisisResponse: boolean;

  if (outcome.severity === "urgent") {
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
