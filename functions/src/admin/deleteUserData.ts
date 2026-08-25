import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { canDelete, isAuthAlreadyDeleted, collectDeletionTargets } from "./deleteUserData.logic";
import { writeAuditLog } from "../audit/writeAuditLog";

const inputSchema = z.object({ targetUid: z.string().min(1) });
const BATCH_SIZE = 300;

async function deleteQueryInBatches(
  build: () => FirebaseFirestore.Query,
): Promise<number> {
  const db = getFirestore();
  let deleted = 0;

  for (;;) {
    const snap = await build().limit(BATCH_SIZE).get();
    if (snap.empty) return deleted;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < BATCH_SIZE) return deleted;
  }
}

/**
 * Khớp từng mục trong collectDeletionTargets() (trừ "users/{uid}", xử lý riêng
 * bên dưới vì đó là xóa một doc, không phải một query) với truy vấn xóa thật
 * và tên field trả về cho caller. Đây là nơi DUY NHẤT ánh xạ tên collection —
 * nếu ai thêm mục mới vào collectDeletionTargets() mà quên thêm handler ở đây,
 * vòng lặp bên dưới sẽ throw ngay thay vì âm thầm bỏ sót dữ liệu (I3: trước đây
 * danh sách trong collectDeletionTargets() và cascade thực tế không liên kết
 * với nhau, nên test so khớp danh sách không đảm bảo được gì).
 */
export const DELETION_TARGET_HANDLERS: Record<
  string,
  {
    resultKey:
      | "attempts" | "answers" | "moods" | "cbtSessions" | "aiJournalOutputs" | "aiUsage"
      | "chatSessions" | "chatMessages" | "crisisAlerts" | "favorites";
    query: (targetUid: string) => FirebaseFirestore.Query;
  }
> = {
  testAttempts: {
    resultKey: "attempts",
    query: (targetUid) => getFirestore().collection("testAttempts").where("userId", "==", targetUid),
  },
  testAnswers: {
    resultKey: "answers",
    query: (targetUid) => getFirestore().collection("testAnswers").where("userId", "==", targetUid),
  },
  moodLogs: {
    resultKey: "moods",
    query: (targetUid) => getFirestore().collection("moodLogs").where("userId", "==", targetUid),
  },
  cbtSessions: {
    resultKey: "cbtSessions",
    query: (targetUid) => getFirestore().collection("cbtSessions").where("userId", "==", targetUid),
  },
  // aiJournalOutputs: phản chiếu AI VỀ CHÍNH ghi chú vừa xóa — bỏ sót mục này là lỗ hổng C1
  // (final whole-branch review): document ở lại vĩnh viễn vì rule của nó đòi uid khớp
  // request.auth.uid, mà uid đó đã không còn tồn tại sau khi xóa xong, và admin bị cấm
  // đọc/xóa collection này. Field lọc là "userId", khớp aiJournalOutputSchema (src/lib/types/ai.ts).
  aiJournalOutputs: {
    resultKey: "aiJournalOutputs",
    query: (targetUid) => getFirestore().collection("aiJournalOutputs").where("userId", "==", targetUid),
  },
  // aiUsage: sổ đếm quota AI, khóa doc theo "{uid}_{feature}_{yyyy-mm-dd}" (functions/src/ai/
  // quota.ts, Fix round 1 Task 5 Finding 1: thêm "{feature}" để phản chiếu và chat không tiêu
  // chung một ngân sách) — không phải một doc-id đơn lẻ nên phải lọc bằng where("uid", ...),
  // không doc(targetUid). Query where("uid",...) không đổi hành vi khi khoá đổi hình dạng —
  // "uid" vẫn là field lọc, không phải một phần bị parse ra từ id.
  aiUsage: {
    resultKey: "aiUsage",
    query: (targetUid) => getFirestore().collection("aiUsage").where("uid", "==", targetUid),
  },
  // chatSessions/chatMessages/crisisAlerts: Task 10 (Spec #4, design spec §7) — sổ đăng ký này
  // đã bị quên BA LẦN (cbtSessions ở 59289ed, rồi aiJournalOutputs/aiUsage bị cả một spec bỏ
  // sót). Cả ba lọc bằng field "userId" (chatSessionSchema/chatMessageSchema/crisisAlertSchema,
  // src/lib/types/chat.ts). `crisisAlerts` là hồ sơ an toàn, không phải nội dung riêng tư —
  // spec mặc định XOÁ nó theo tài khoản (nhất quán với lời hứa "xoá toàn bộ"); nếu nhà trường
  // cần giữ lại để có nghĩa vụ lưu trữ, đó là quyết định con người cần ghi vào
  // docs/ai-go-live-checklist.md, không phải một nhánh code im lặng ở đây.
  chatSessions: {
    resultKey: "chatSessions",
    query: (targetUid) => getFirestore().collection("chatSessions").where("userId", "==", targetUid),
  },
  chatMessages: {
    resultKey: "chatMessages",
    query: (targetUid) => getFirestore().collection("chatMessages").where("userId", "==", targetUid),
  },
  crisisAlerts: {
    resultKey: "crisisAlerts",
    query: (targetUid) => getFirestore().collection("crisisAlerts").where("userId", "==", targetUid),
  },
  "users/{uid}/favorites": {
    resultKey: "favorites",
    query: (targetUid) => getFirestore().collection("users").doc(targetUid).collection("favorites"),
  },
};

export const deleteUserData = onCall({ region: "asia-southeast1" }, async (request) => {
  const auth = request.auth
    ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
    : undefined;

  const parsed = inputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Thiếu targetUid.");

  const { targetUid } = parsed.data;
  if (!canDelete(auth, targetUid)) {
    throw new HttpsError("permission-denied", "Bạn không có quyền xóa dữ liệu này.");
  }

  const db = getFirestore();

  // Danh sách nơi cần xóa lấy trực tiếp từ collectDeletionTargets() — mục cuối
  // cùng LUÔN là "users/{uid}" (xem giải thích thứ tự ở deleteUserData.logic.ts),
  // xử lý riêng vì đó là xóa một document chứ không phải một query.
  const targets = collectDeletionTargets();
  const userDocTarget = targets[targets.length - 1];
  if (userDocTarget !== "users/{uid}") {
    throw new Error(
      `deleteUserData: mục cuối cùng của collectDeletionTargets() phải là "users/{uid}", nhận được "${userDocTarget}".`,
    );
  }

  const deleted: Record<string, number> = {};
  for (const target of targets.slice(0, -1)) {
    const handler = DELETION_TARGET_HANDLERS[target];
    if (!handler) {
      throw new Error(`deleteUserData: chưa có handler xóa dữ liệu cho "${target}".`);
    }
    deleted[handler.resultKey] = await deleteQueryInBatches(() => handler.query(targetUid));
  }
  const attempts = deleted.attempts ?? 0;
  const answers = deleted.answers ?? 0;
  const moods = deleted.moods ?? 0;
  const cbtSessions = deleted.cbtSessions ?? 0;
  const aiJournalOutputs = deleted.aiJournalOutputs ?? 0;
  const aiUsage = deleted.aiUsage ?? 0;
  const chatSessions = deleted.chatSessions ?? 0;
  const chatMessages = deleted.chatMessages ?? 0;
  const crisisAlerts = deleted.crisisAlerts ?? 0;
  const favorites = deleted.favorites ?? 0;

  await db.collection("users").doc(targetUid).delete();

  // Chỉ nuốt đúng lỗi "tài khoản Auth đã bị xóa từ trước" — mọi lỗi khác (thiếu
  // quyền, hết quota, mất kết nối...) phải được coi là THẤT BẠI thật sự. Dữ liệu
  // Firestore đã dọn xong ở bước trên, nên không rollback được nữa — nhưng cũng
  // không được ghi audit log và trả về như thể Auth cũng đã xóa xong, kẻo học
  // sinh tưởng nhầm tài khoản đăng nhập của mình đã biến mất trong khi vẫn còn.
  let authDeleteFailed = false;
  try {
    await getAuth().deleteUser(targetUid);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (!isAuthAlreadyDeleted(code)) {
      console.error("deleteUserData: xóa Auth thất bại, dữ liệu Firestore đã xóa xong", {
        targetUid, error,
      });
      authDeleteFailed = true;
    }
  }

  await writeAuditLog({
    actorUid: auth!.uid,
    action: "deleteUserData",
    targetType: "user",
    targetId: targetUid,
    before: {
      attempts, answers, moods, cbtSessions, aiJournalOutputs, aiUsage,
      chatSessions, chatMessages, crisisAlerts, favorites,
    },
    after: authDeleteFailed ? { authDeleteFailed: true } : null,
  });

  const deletedResult = {
    attempts, answers, moods, cbtSessions, aiJournalOutputs, aiUsage,
    chatSessions, chatMessages, crisisAlerts, favorites,
  };

  return authDeleteFailed
    ? { ok: true, deleted: deletedResult, authDeleteFailed: true }
    : { ok: true, deleted: deletedResult };
});
