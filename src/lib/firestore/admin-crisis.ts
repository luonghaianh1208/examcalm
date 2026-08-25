"use client";

import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import type { CrisisAlert } from "@/lib/types/chat";

export type CrisisAlertRecord = CrisisAlert & { id: string };

/** Trích TỪNG field tường minh từ document thô — KHÔNG BAO GIỜ `{...(doc.data() as T)}` (design
 *  spec §3.4: `crisisAlerts` CỐ Ý không được mang messageText/trích đoạn/tóm tắt nào; nếu một
 *  field lạ như vậy lỡ lọt vào document vì lý do gì đó, spread sẽ mang nó thẳng ra UI — trích
 *  tường minh thì không thể). Document lệch hình dạng rơi về fallback an toàn, không throw. */
function toCrisisAlertRecord(id: string, data: Record<string, unknown>): CrisisAlertRecord {
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    severity: data.severity === "urgent" ? "urgent" : "concern",
    triggeredBy:
      data.triggeredBy === "keyword" || data.triggeredBy === "model" || data.triggeredBy === "both"
        ? data.triggeredBy
        : "keyword",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
    handledBy: typeof data.handledBy === "string" ? data.handledBy : null,
    handledAt: data.handledAt instanceof Timestamp ? data.handledAt.toDate() : null,
  };
}

/** true nếu cảnh báo CHƯA xử lý — khoá theo `handledBy`, KHÔNG BAO GIỜ theo `handledAt`.
 *  firestore.rules cho phép một admin MỞ LẠI một cảnh báo bằng cách ghi `handledBy: null` mà
 *  không bắt buộc xoá `handledAt` cùng lúc — hai field có thể lệch nhau có chủ đích. Khoá nhầm
 *  theo `handledAt` sẽ khiến một cảnh báo vừa được mở lại vẫn hiện như đã xử lý, và một thầy cô
 *  sẽ ngừng để ý tới nó. */
export function isAlertUnhandled(alert: Pick<CrisisAlertRecord, "handledBy">): boolean {
  return alert.handledBy === null;
}

/** Liệt kê cảnh báo khủng hoảng cho admin — CHƯA xử lý lên đầu, mới nhất trên cùng trong mỗi
 *  nhóm (task-9-brief.md, Step 1, mục 1). `orderBy("createdAt", "desc")` trong query CHỈ để giới
 *  hạn `limit` lấy đúng các document mới nhất — thứ tự HIỂN THỊ cuối cùng vẫn tự sắp lại tường
 *  minh ở đây (khoá chính: trạng thái xử lý qua `isAlertUnhandled` — theo `handledBy`, KHÔNG
 *  BAO GIỜ `handledAt`; khoá phụ: `createdAt` giảm dần), không dựa vào thứ tự Firestore trả sẵn
 *  đã đúng ý muốn hiển thị. */
export async function listCrisisAlerts(max = 200): Promise<CrisisAlertRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(collection(getDb(), "crisisAlerts"), orderBy("createdAt", "desc"), limit(max)),
  );
  const records = snap.docs.map((d) => toCrisisAlertRecord(d.id, d.data()));
  return records.sort((a, b) => {
    const handledDiff = Number(!isAlertUnhandled(a)) - Number(!isAlertUnhandled(b));
    if (handledDiff !== 0) return handledDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Tự nhận xử lý một cảnh báo BẰNG CHÍNH admin đang gọi — `adminUid` luôn là uid của người gọi,
 *  không có đường nào gán `handledBy` cho một admin khác (design spec §5: rule chỉ chấp nhận
 *  `handledBy == request.auth.uid`). Chỉ ghi ĐÚNG hai field `handledBy` + `handledAt`. */
export async function markCrisisAlertHandled(alertId: string, adminUid: string): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "crisisAlerts", alertId), {
    handledBy: adminUid,
    handledAt: serverTimestamp(),
  });
}

/** Mở lại một cảnh báo đã xử lý — khả dụng cho BẤT KỲ admin nào, không chỉ người đã tự nhận xử
 *  lý trước đó (design spec §5: một cảnh báo bị xử lý sai không được kẹt vĩnh viễn chỉ vì người
 *  xử lý sai đó không có mặt). Hàm không cần biết admin nào đang gọi. */
export async function reopenCrisisAlert(alertId: string): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "crisisAlerts", alertId), {
    handledBy: null,
    handledAt: null,
  });
}
