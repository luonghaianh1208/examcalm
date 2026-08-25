"use client";

import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query,
  serverTimestamp, Timestamp, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { callSendChatMessage } from "@/lib/firebase/functions-client";

// Trần cứng của Firestore: writeBatch() từ chối quá 500 thao tác. deleteSession phải tự
// chia nhỏ thành nhiều batch — xem giải thích đầy đủ ở ai-outputs.ts::deleteAllMyOutputs.
const BATCH_DELETE_LIMIT = 500;

export type ChatSessionRecord = {
  id: string;
  userId: string;
  startedAt: Date | null;
  lastMessageAt: Date | null;
  messageCount: number;
};

export type ChatMessageRecord = {
  id: string;
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  isCrisisResponse: boolean;
  createdAt: Date | null;
};

/**
 * Map TỪNG TRƯỜNG tường minh — KHÔNG BAO GIỜ `{...doc.data()}`. Spread mang theo instance
 * class Timestamp của Firestore vào props Client Component và sập trang (xem AGENTS.md,
 * cùng lý do ai-outputs.ts::mapAiOutputDoc).
 */
function mapSessionDoc(d: QueryDocumentSnapshot<DocumentData>): ChatSessionRecord {
  const data = d.data();
  const startedAt = data.startedAt;
  const lastMessageAt = data.lastMessageAt;
  return {
    id: d.id,
    userId: data.userId as string,
    startedAt: startedAt instanceof Timestamp ? startedAt.toDate() : null,
    lastMessageAt: lastMessageAt instanceof Timestamp ? lastMessageAt.toDate() : null,
    messageCount: data.messageCount as number,
  };
}

function mapMessageDoc(d: QueryDocumentSnapshot<DocumentData>): ChatMessageRecord {
  const data = d.data();
  const createdAt = data.createdAt;
  return {
    id: d.id,
    userId: data.userId as string,
    sessionId: data.sessionId as string,
    role: data.role as "user" | "assistant",
    text: data.text as string,
    isCrisisResponse: data.isCrisisResponse as boolean,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
  };
}

function messageCreatedAtMillis(d: QueryDocumentSnapshot<DocumentData>): number {
  const createdAt = d.data().createdAt;
  return createdAt instanceof Timestamp ? createdAt.toDate().getTime() : 0;
}

// Mã lỗi Firestore SDK thô (FirestoreError.code) — KHÔNG có tiền tố "functions/" như lỗi
// callable (khác extractFunctionsErrorCode bên dưới). Dùng cho NĂM hàm gọi thẳng Firestore
// (startChatSession, listMessages, listMySessions, deleteMessage, deleteSession) — chỉ
// sendMessage đi qua callable. Fix round 1 cho Task 6 (Finding 1, coordinator): trước fix
// này, năm hàm đó không bọc try/catch nào cả, nên một lỗi Rules thô (vd học sinh chưa xác
// thực email gọi startChatSession, hoặc deleteSession trên session không thuộc về mình khiến
// cả batch bị từ chối) ném thẳng "Missing or insufficient permissions" tiếng Anh ra ngoài.
function extractFirestoreErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * Map mã lỗi Firestore SDK thô thành thông điệp tiếng Việt thân thiện — dùng cho các thao
 * tác Firestore TRỰC TIẾP (không qua callable), nơi KHÔNG có `details` để phân biệt nguyên
 * nhân cụ thể như HttpsError của callable. Cố ý trung tính cho "permission-denied": nguyên
 * nhân có thể là chưa xác thực email (startChatSession, xem firestore.rules `isVerified()`)
 * HOẶC không phải chủ sở hữu tài liệu (đọc/xoá tài liệu người khác) — không đoán mò là
 * nguyên nhân nào, cùng tinh thần "không xác nhận dữ liệu tồn tại" của mapPermissionDeniedMessage.
 */
function mapFirestoreErrorMessage(err: unknown): string {
  switch (extractFirestoreErrorCode(err)) {
    case "permission-denied":
      return "Bạn không có quyền thực hiện thao tác này, thử lại sau nhé.";
    case "unavailable":
      return "Không có kết nối mạng, thử lại sau nhé.";
    default:
      return "Không thể thực hiện thao tác này lúc này, thử lại sau nhé.";
  }
}

/**
 * Mở một phiên chat mới. Khác `chatMessages` (mọi tin PHẢI qua callable, xem
 * firestore.rules), `chatSessions` cho phép client tự ghi trực tiếp — chỉ Cloud Function
 * mới được `update` (lastMessageAt/messageCount), nên document khởi tạo ở đây chỉ có đúng
 * bốn field, `messageCount` bắt đầu từ 0. Rule đòi `isVerified()` để tạo — một học sinh
 * chưa xác thực email gặp `permission-denied` thô ở đây, dịch qua mapFirestoreErrorMessage.
 */
export async function startChatSession(uid: string): Promise<string> {
  await ensureAuthReady();
  try {
    const ref = await addDoc(collection(getDb(), "chatSessions"), {
      userId: uid,
      startedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      messageCount: 0,
    });
    return ref.id;
  } catch (err) {
    throw new Error(mapFirestoreErrorMessage(err));
  }
}

// Mã lỗi callable thật có dạng "functions/<code>" (FunctionsErrorCode của SDK) — bóc tiền
// tố ra để switch cho gọn. Lỗi không đúng hình dạng (network Error thô...) trả về null, rơi
// vào nhánh default. Trùng lặp có chủ đích với ai-outputs.ts — không import qua module khác
// chỉ để share một hàm bốn dòng (AGENTS.md: không tạo abstraction cho chỗ dùng ngoài phạm vi
// thay đổi hiện tại).
function extractFunctionsErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  if (typeof code !== "string") return null;
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

// `details.reason` — discriminator gắn vào HttpsError của sendChatMessage.ts. Đọc PHÒNG THỦ,
// dùng CHUNG cho cả ba nhánh cần phân biệt nguyên nhân bên dưới (permission-denied:
// email_unverified/ai_opt_in; resource-exhausted: quota/rate_limit; internal: saved) — MỘT
// quy ước duy nhất thay vì mỗi mã lỗi tự bịa cách đọc details riêng (Fix round 1 cho Task 6,
// Finding 3: coordinator yêu cầu dùng chung một shape thay vì hai). Thiếu `details`, hình
// dạng sai, hoặc `reason` không phải string đều trả về null (nhánh trung tính/an toàn).
function extractErrorDetailsReason(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("details" in err)) return null;
  const details = (err as { details: unknown }).details;
  if (typeof details !== "object" || details === null || !("reason" in details)) return null;
  const reason = (details as { reason: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/**
 * `resource-exhausted` của sendChatMessage gộp HAI nguyên nhân khác nhau — hết quota ngày,
 * hoặc rate limit (xem functions/src/ai/sendChatMessage.ts, nhánh `quota.reason`). Phân biệt
 * bằng `details.reason` ("quota" | "rate_limit") — KHÔNG còn regex/substring lại câu tiếng
 * Việt của server (Fix round 1 cho Task 6, Finding 3: đó là cùng dạng lỗi Spec #3 Task 8 đã
 * mắc với extractTriggeredKeyword — đổi câu chữ server sẽ âm thầm phá cách nhận diện mà
 * không test nào bắt được). `details.reason` thiếu/sai hình dạng (hiếm, hình dạng lỗi hỏng)
 * → mặc định về nhánh rate limit: nói "gửi hơi nhanh" khi thực ra đã hết quota ngày là hơi
 * thừa, nhưng nói "hết lượt hôm nay" khi em chỉ gửi hơi nhanh là SAI BẢN CHẤT và gây hoang
 * mang hơn (đúng lý do brief Task 6 nêu), nên mặc định chọn nhánh ít sai hơn.
 */
function mapResourceExhaustedMessage(err: unknown): string {
  if (extractErrorDetailsReason(err) === "quota") {
    // KHÔNG dùng từ "lỗi", không hàm ý em làm sai — hết lượt hôm nay không phải lỗi của em.
    return "Bạn đã dùng hết lượt trò chuyện AI hôm nay rồi, mai quay lại nhé.";
  }
  return "Bạn đang gửi tin hơi nhanh, chờ một chút rồi gửi lại nhé.";
}

/**
 * `permission-denied` gộp BA nguyên nhân ở server (đối chiếu sendChatMessage.ts): email
 * chưa xác thực, chưa bật đồng ý dùng AI, và session không thuộc về mình. Hai nguyên nhân
 * đầu kèm `details.reason`; nguyên nhân thứ ba CỐ Ý không kèm `details` — để không xác nhận
 * với học sinh rằng session đó tồn tại và thuộc về người khác — rơi vào default bên dưới.
 */
function mapPermissionDeniedMessage(err: unknown): string {
  switch (extractErrorDetailsReason(err)) {
    case "email_unverified":
      return "Bạn cần xác thực email trước khi dùng tính năng này.";
    case "ai_opt_in":
      return "Bạn cần bật tính năng AI trong phần Cài đặt riêng tư để dùng chức năng này.";
    default:
      return "Bạn không thể thực hiện thao tác này, thử lại sau nhé.";
  }
}

/**
 * `internal` xảy ra ở BA throw site tường minh trong sendChatMessage.ts (provider lỗi, output
 * không an toàn, câu trả lời rỗng sau khi bóc nhãn) — cả ba đều nằm SAU appendChatMessage(user)
 * nên đều kèm `details: { reason: "saved" }`. Nhưng `onCall` cũng tự bọc MỌI exception chưa
 * bắt (đọc userSnap, sessionRef, aiConfig, lịch sử, quota...) thành đúng cùng mã `internal` mà
 * KHÔNG có marker này — những throw đó có thể xảy ra TRƯỚC khi tin nhắn được lưu. Fix round 1
 * cho Task 6 (Finding 2, coordinator): chỉ trấn an "đã lưu" khi thấy marker `saved` — nếu
 * không, một thông điệp trung tính không khẳng định gì về việc tin nhắn có được lưu hay không.
 */
function mapInternalMessage(err: unknown): string {
  if (extractErrorDetailsReason(err) === "saved") {
    return "Không thể trả lời lúc này, nhưng tin nhắn của bạn đã được lưu. Thử lại sau nhé.";
  }
  return "Không thể trả lời lúc này, thử lại sau nhé.";
}

/**
 * Map mã lỗi callable `sendChatMessage` thành thông điệp tiếng Việt thân thiện — KHÔNG BAO
 * GIỜ phơi mã lỗi Firebase thô hay văn bản tiếng Anh cho học sinh. Đối chiếu từng nhánh
 * throw ở functions/src/ai/sendChatMessage.ts.
 */
function mapSendMessageErrorMessage(err: unknown): string {
  switch (extractFunctionsErrorCode(err)) {
    case "resource-exhausted":
      return mapResourceExhaustedMessage(err);
    case "permission-denied":
      return mapPermissionDeniedMessage(err);
    case "failed-precondition":
      // Kill switch bật hoặc chưa cấu hình baseUrl — trung tính, không đổ lỗi.
      return "Tính năng trò chuyện AI hiện chưa sẵn sàng, thử lại sau nhé.";
    case "invalid-argument":
      // inputSchema.safeParse thất bại khi THIẾU/SAI sessionId HOẶC text rỗng/toàn khoảng
      // trắng/quá dài (một message chung cho cả hai, xem sendChatMessage.ts:442-445) — thông
      // điệp phải phủ cả hai nguyên nhân, không chỉ đổ cho "nội dung tin nhắn" (Fix round 1
      // cho Task 6, Finding 4).
      return "Không gửi được tin nhắn này — thử tải lại trang hoặc kiểm tra lại nội dung rồi gửi lại nhé.";
    case "internal":
      return mapInternalMessage(err);
    default:
      return "Không thể gửi tin nhắn lúc này, thử lại sau nhé.";
  }
}

/** Gọi callable `sendChatMessage` cho một tin nhắn. */
export async function sendMessage(
  sessionId: string,
  text: string,
): Promise<{ messageId: string }> {
  await ensureAuthReady();
  try {
    return await callSendChatMessage(sessionId, text);
  } catch (err) {
    throw new Error(mapSendMessageErrorMessage(err));
  }
}

/**
 * Liệt kê tin nhắn của một phiên, cũ → mới. Lọc bằng HAI `where` (userId, sessionId) KHÔNG
 * kèm `orderBy` để tránh cần composite index — sắp xếp trong bộ nhớ, cùng kỹ thuật
 * ai-outputs.ts::getOutputForMoodLog. `where("userId", ...)` còn BẮT BUỘC để Security
 * Rules chấp nhận truy vấn liệt kê: Firestore đòi query tự chứng minh khớp rule qua chính
 * where clause, không chỉ lọc kết quả sau khi đọc.
 */
export async function listMessages(uid: string, sessionId: string): Promise<ChatMessageRecord[]> {
  await ensureAuthReady();
  try {
    const snap = await getDocs(
      query(
        collection(getDb(), "chatMessages"),
        where("userId", "==", uid),
        where("sessionId", "==", sessionId),
      ),
    );
    return [...snap.docs]
      .sort((a, b) => messageCreatedAtMillis(a) - messageCreatedAtMillis(b))
      .map(mapMessageDoc);
  } catch (err) {
    throw new Error(mapFirestoreErrorMessage(err));
  }
}

/**
 * Liệt kê các phiên chat của học sinh, mới nhất trước. MỘT `where` (userId) + `orderBy`
 * (lastMessageAt) trên field KHÁC không cần composite index — khác `listMessages` ở trên
 * (hai `where` cùng lúc thì cần), cùng kỹ thuật cbt-sessions.ts::listMyCbtSessions.
 */
export async function listMySessions(uid: string): Promise<ChatSessionRecord[]> {
  await ensureAuthReady();
  try {
    const snap = await getDocs(
      query(
        collection(getDb(), "chatSessions"),
        where("userId", "==", uid),
        orderBy("lastMessageAt", "desc"),
      ),
    );
    return snap.docs.map(mapSessionDoc);
  } catch (err) {
    throw new Error(mapFirestoreErrorMessage(err));
  }
}

/** Xoá một tin nhắn — chủ sở hữu tự dọn hội thoại. */
export async function deleteMessage(id: string): Promise<void> {
  await ensureAuthReady();
  try {
    await deleteDoc(doc(getDb(), "chatMessages", id));
  } catch (err) {
    throw new Error(mapFirestoreErrorMessage(err));
  }
}

/**
 * Xoá một phiên chat VÀ TOÀN BỘ tin nhắn thuộc phiên đó. writeBatch() của Firestore trần
 * cứng 500 thao tác/batch — một hội thoại dài có thể vượt trần này, nên chia refs (document
 * phiên + mọi tin nhắn) thành từng lô tối đa BATCH_DELETE_LIMIT, commit tuần tự, cùng kỹ
 * thuật ai-outputs.ts::deleteAllMyOutputs. Document phiên nằm CHUNG lô đầu tiên với tin
 * nhắn, không tách riêng — mỗi document là một thao tác xoá độc lập, thứ tự giữa các lô
 * không ảnh hưởng tới kết quả cuối cùng.
 */
export async function deleteSession(uid: string, sessionId: string): Promise<void> {
  await ensureAuthReady();
  try {
    const snap = await getDocs(
      query(
        collection(getDb(), "chatMessages"),
        where("userId", "==", uid),
        where("sessionId", "==", sessionId),
      ),
    );
    const refs = [doc(getDb(), "chatSessions", sessionId), ...snap.docs.map((d) => d.ref)];

    for (let i = 0; i < refs.length; i += BATCH_DELETE_LIMIT) {
      const chunk = refs.slice(i, i + BATCH_DELETE_LIMIT);
      const batch = writeBatch(getDb());
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    // Batch của Firestore ATOMIC: nếu document phiên trong chunk không thuộc về `uid` (rule
    // từ chối), CẢ chunk đó bị từ chối dù phần tin nhắn được lọc đúng bằng where("userId"...)
    // — lỗi permission-denied thô vẫn có thể lọt ra từ batch.commit(), không chỉ từ getDocs().
    throw new Error(mapFirestoreErrorMessage(err));
  }
}
