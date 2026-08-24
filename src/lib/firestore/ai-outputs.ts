"use client";

import {
  collection, deleteDoc, doc, getDocs, query, Timestamp, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { callGenerateReflection } from "@/lib/firebase/functions-client";

// Trần cứng của Firestore: writeBatch() từ chối quá 500 thao tác. deleteAllMyOutputs
// phải tự chia nhỏ thành nhiều batch khi học sinh có nhiều hơn 500 phản chiếu.
const BATCH_DELETE_LIMIT = 500;

export type AiJournalOutputRecord = {
  id: string;
  userId: string;
  moodLogId: string;
  reflectionText: string;
  catStoryText: string;
  journalPrompt: string;
  promptTemplateId: string;
  promptVersion: number;
  providerLabel: string;
  model: string;
  userFeedback: "helpful" | "not_helpful" | null;
  createdAt: Date | null;
};

/**
 * Map TỪNG TRƯỜNG tường minh — KHÔNG BAO GIỜ `{...doc.data()}`. Spread mang
 * theo instance class Timestamp của Firestore vào props Client Component và
 * sập trang với "Only frozen plain objects can be passed to Client
 * Components" — sự cố này đã lên production một lần (xem AGENTS.md/brief).
 */
function mapAiOutputDoc(d: QueryDocumentSnapshot<DocumentData>): AiJournalOutputRecord {
  const data = d.data();
  const createdAt = data.createdAt;
  return {
    id: d.id,
    userId: data.userId as string,
    moodLogId: data.moodLogId as string,
    reflectionText: data.reflectionText as string,
    catStoryText: data.catStoryText as string,
    journalPrompt: data.journalPrompt as string,
    promptTemplateId: data.promptTemplateId as string,
    promptVersion: data.promptVersion as number,
    providerLabel: data.providerLabel as string,
    model: data.model as string,
    userFeedback: (data.userFeedback ?? null) as "helpful" | "not_helpful" | null,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
  };
}

function createdAtMillis(d: QueryDocumentSnapshot<DocumentData>): number {
  const createdAt = d.data().createdAt;
  return createdAt instanceof Timestamp ? createdAt.toDate().getTime() : 0;
}

/**
 * Map mã lỗi callable `generateReflection` thành thông điệp tiếng Việt thân
 * thiện — KHÔNG BAO GIỜ phơi mã lỗi Firebase thô hay văn bản tiếng Anh cho
 * học sinh. Đối chiếu từng nhánh throw ở functions/src/ai/generateReflection.ts.
 */
function mapReflectionErrorMessage(err: unknown): string {
  switch (extractFunctionsErrorCode(err)) {
    case "resource-exhausted":
      // KHÔNG phải lỗi của học sinh — chỉ là đã dùng hết lượt hôm nay.
      // Cố ý không dùng từ "lỗi" và không nghe như học sinh đã làm gì sai.
      return "Bạn đã dùng hết lượt phản chiếu AI cho hôm nay rồi, mai quay lại nhé.";
    case "failed-precondition":
      // Tính năng đang tắt hoặc chưa cấu hình — trung tính, không đổ lỗi.
      return "Tính năng phản chiếu AI hiện chưa sẵn sàng, thử lại sau nhé.";
    case "permission-denied":
      return mapPermissionDeniedMessage(err);
    case "internal":
      // Lỗi phía hệ thống — trấn an: nhật ký cảm xúc vẫn được lưu bình thường.
      return "Không thể tạo phản chiếu lúc này, nhưng nhật ký cảm xúc của bạn đã được lưu an toàn. Thử lại sau nhé.";
    default:
      return "Không thể thực hiện thao tác này lúc này, thử lại sau nhé.";
  }
}

/**
 * `permission-denied` gộp BA nguyên nhân khác nhau ở server (đối chiếu
 * functions/src/ai/generateReflection.ts): email chưa xác thực, chưa bật
 * đồng ý dùng AI, và mood log không thuộc về mình. Server gắn discriminator
 * `details.reason` cho hai nguyên nhân đầu (Fix round 1, Finding 1) — nhánh
 * thứ ba (ownership) CỐ Ý không kèm `details`, để không xác nhận với học sinh
 * rằng nhật ký đó tồn tại và thuộc về người khác; nhánh đó rơi vào default
 * bên dưới, không nhắc tới "cài đặt" (chỉ đúng cho ai_opt_in).
 */
function mapPermissionDeniedMessage(err: unknown): string {
  switch (extractPermissionDeniedReason(err)) {
    case "email_unverified":
      return "Bạn cần xác thực email trước khi dùng tính năng này.";
    case "ai_opt_in":
      return "Bạn cần bật tính năng AI trong phần Cài đặt riêng tư để dùng chức năng này.";
    default:
      return "Bạn không thể thực hiện thao tác này, thử lại sau nhé.";
  }
}

// Mã lỗi callable thật có dạng "functions/<code>" (FunctionsErrorCode của SDK)
// — bóc tiền tố đó ra để switch cho gọn. Lỗi không đúng hình dạng (network
// Error thô...) trả về null, rơi vào nhánh default ở trên.
function extractFunctionsErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  if (typeof code !== "string") return null;
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

// `details.reason` — discriminator ngắn do generateReflection.ts gắn vào
// HttpsError cho permission-denied. Thiếu `details`, hình dạng sai, hoặc
// `reason` không phải string đều trả về null (nhánh trung tính, an toàn).
function extractPermissionDeniedReason(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("details" in err)) return null;
  const details = (err as { details: unknown }).details;
  if (typeof details !== "object" || details === null || !("reason" in details)) return null;
  const reason = (details as { reason: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/** Gọi callable `generateReflection` cho một moodLog. */
export async function requestReflection(moodLogId: string): Promise<{ outputId: string }> {
  await ensureAuthReady();
  try {
    return await callGenerateReflection(moodLogId);
  } catch (err) {
    throw new Error(mapReflectionErrorMessage(err));
  }
}

/**
 * Đọc phản chiếu AI mới nhất của một moodLog. Lọc bằng hai `where` (userId,
 * moodLogId) KHÔNG kèm `orderBy` để tránh cần composite index — nếu có nhiều
 * bản (học sinh yêu cầu lại), chọn bản mới nhất trong bộ nhớ, giống kỹ thuật
 * loadPromptTemplate ở functions/src/ai/generateReflection.ts.
 */
export async function getOutputForMoodLog(
  uid: string,
  moodLogId: string,
): Promise<AiJournalOutputRecord | null> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(
      collection(getDb(), "aiJournalOutputs"),
      where("userId", "==", uid),
      where("moodLogId", "==", moodLogId),
    ),
  );
  if (snap.docs.length === 0) return null;
  const latest = snap.docs.reduce((best, d) =>
    createdAtMillis(d) > createdAtMillis(best) ? d : best,
  );
  return mapAiOutputDoc(latest);
}

/**
 * Liệt kê mọi phản chiếu AI của một học sinh, mới nhất trước. Chỉ lọc bằng
 * `where("userId", "==", uid)` — không `orderBy` trong query, sắp xếp trong
 * bộ nhớ để tránh cần composite index (xem ghi chú getOutputForMoodLog).
 */
export async function listMyOutputs(uid: string, max = 100): Promise<AiJournalOutputRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(collection(getDb(), "aiJournalOutputs"), where("userId", "==", uid)),
  );
  return snap.docs
    .map(mapAiOutputDoc)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, max);
}

/**
 * Ghi lại đánh giá của học sinh cho một phản chiếu. `value` chấp nhận `null`
 * để RÚT LẠI đánh giá — Security Rules cho phép ghi `userFeedback: null` tường
 * minh nhưng từ chối `deleteField()` (xem tests/rules/ai.test.ts), nên hàm
 * này luôn ghi `null` như một giá trị JS thật, không bao giờ dùng deleteField().
 * Payload CHỈ chứa đúng trường `userFeedback` — khớp `hasOnly(["userFeedback"])`
 * ở Security Rules.
 */
export async function setOutputFeedback(
  id: string,
  value: "helpful" | "not_helpful" | null,
): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "aiJournalOutputs", id), { userFeedback: value });
}

/** Xoá một phản chiếu AI. */
export async function deleteOutput(id: string): Promise<void> {
  await ensureAuthReady();
  await deleteDoc(doc(getDb(), "aiJournalOutputs", id));
}

/**
 * Xoá TOÀN BỘ phản chiếu AI của một học sinh (vd khi rút đồng ý dùng AI hoặc
 * xoá tài khoản). writeBatch() của Firestore trần cứng 500 thao tác/batch —
 * chia docs thành từng lô tối đa BATCH_DELETE_LIMIT, commit tuần tự, trả về
 * tổng số đã xoá.
 */
export async function deleteAllMyOutputs(uid: string): Promise<number> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(collection(getDb(), "aiJournalOutputs"), where("userId", "==", uid)),
  );
  const refs = snap.docs.map((d) => d.ref);

  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_DELETE_LIMIT) {
    const chunk = refs.slice(i, i + BATCH_DELETE_LIMIT);
    const batch = writeBatch(getDb());
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}
