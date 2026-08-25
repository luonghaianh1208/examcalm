"use client";

import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc, where,
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
    // Fix round 1, Finding 5: fallback KHÔNG được là một ngày THẬT (vd new Date(0) = 1970) —
    // CrisisAlertList.tsx hiện createdAt trực tiếp trên mỗi dòng, và một epoch date đọc như một
    // thời điểm thật thay vì "không đọc được". Invalid Date (`new Date(NaN)`) là sentinel duy
    // nhất phân biệt được bằng `Number.isNaN(d.getTime())` — component render "Không rõ thời
    // điểm" thay vì gọi formatter trực tiếp lên nó.
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(NaN),
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

export type ListCrisisAlertsResult = {
  alerts: CrisisAlertRecord[];
  /** I6 (final whole-branch review): true nếu CÓ THỂ còn cảnh báo ĐÃ XỬ LÝ không nằm trong
   *  danh sách này — xảy ra khi số cảnh báo GẦN ĐÂY (bất kể trạng thái) vượt quá `max`. Cảnh
   *  báo CHƯA xử lý KHÔNG BAO GIỜ bị cắt bởi giới hạn này (xem truy vấn riêng bên dưới) —
   *  `truncated` chỉ cảnh báo về phần "đã xử lý, hiện thêm cho ngữ cảnh". */
  truncated: boolean;
};

/**
 * Liệt kê cảnh báo khủng hoảng cho admin — CHƯA xử lý lên đầu, mới nhất trên cùng trong mỗi
 * nhóm (task-9-brief.md, Step 1, mục 1).
 *
 * I6 (final whole-branch review, Important): bản trước CHỈ chạy một truy vấn
 * `orderBy("createdAt", "desc").limit(200)` rồi sắp chưa-xử-lý-lên-đầu TRONG BỘ NHỚ — nghĩa là
 * 200 "chỗ" đó bị CẢ cảnh báo đã xử lý lẫn chưa xử lý cùng tranh nhau. Một cảnh báo bị bỏ sót
 * trong tuần thi cử bận rộn rơi hẳn ra khỏi kết quả một khi đủ 200 cảnh báo MỚI HƠN (kể cả đã xử
 * lý) tích luỹ — không phân trang, không dấu hiệu bị cắt, trang admin trông gọn gàng trong khi
 * đúng cảnh báo cần thấy nhất đã biến mất. Đây là design risk R2 (design spec §9) thành hiện
 * thực trong code.
 *
 * SỬA: chạy HAI truy vấn song song — (1) MỌI cảnh báo CHƯA xử lý (`where("handledBy", "==",
 * null)`, không giới hạn theo `createdAt` gần đây — một cảnh báo chưa xử lý dù cũ tới đâu vẫn
 * PHẢI hiện), và (2) `max` cảnh báo GẦN ĐÂY NHẤT bất kể trạng thái (giữ hành vi cũ, cho ngữ cảnh
 * "gần đây có gì"). Gộp theo id (không trùng lặp), sắp lại đúng quy tắc cũ. Cảnh báo CHƯA xử lý
 * giờ chỉ bị thiếu nếu bản thân SỐ LƯỢNG cảnh báo chưa xử lý vượt `max` — một tình huống chính nó
 * đã là một khủng hoảng vận hành (quá nhiều cảnh báo chưa ai xử lý), không phải một lỗ hổng
 * hiển thị âm thầm.
 *
 * Chú ý index: truy vấn (1) đòi composite index RIÊNG (`handledBy` ASC + `createdAt` DESC) —
 * index `crisisAlerts` sẵn có trong `firestore.indexes.json` (`userId` + `handledBy` +
 * `createdAt`) phục vụ `findRecentUnhandledAlert` (functions/src/ai/sendChatMessage.ts), KHÔNG
 * phục vụ truy vấn này (không lọc theo `userId`).
 */
export async function listCrisisAlerts(max = 200): Promise<ListCrisisAlertsResult> {
  await ensureAuthReady();
  const db = getDb();
  const alertsCollection = collection(db, "crisisAlerts");

  const [unhandledSnap, recentSnap] = await Promise.all([
    getDocs(
      query(alertsCollection, where("handledBy", "==", null), orderBy("createdAt", "desc"), limit(max)),
    ),
    getDocs(query(alertsCollection, orderBy("createdAt", "desc"), limit(max))),
  ]);

  const byId = new Map<string, CrisisAlertRecord>();
  for (const d of unhandledSnap.docs) {
    byId.set(d.id, toCrisisAlertRecord(d.id, d.data()));
  }
  for (const d of recentSnap.docs) {
    if (!byId.has(d.id)) byId.set(d.id, toCrisisAlertRecord(d.id, d.data()));
  }

  const alerts = Array.from(byId.values()).sort((a, b) => {
    const handledDiff = Number(!isAlertUnhandled(a)) - Number(!isAlertUnhandled(b));
    if (handledDiff !== 0) return handledDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  // "Chạm trần" ở MỘT trong hai truy vấn là tín hiệu đáng tin có thể còn document chưa lấy được
  // — một truy vấn trả về ÍT HƠN `max` nghĩa là chắc chắn đã lấy hết phần của nó.
  const truncated = unhandledSnap.docs.length >= max || recentSnap.docs.length >= max;

  return { alerts, truncated };
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
