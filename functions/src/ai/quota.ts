// Module có đọc/ghi Firestore — khác bốn module thuần TypeScript còn lại trong thư mục
// này (openaiClient, safetyFilter, parseOutput, buildPrompt). `db` LUÔN nhận qua tham số,
// KHÔNG bao giờ tự gọi getFirestore() trong module — đó là điều cho phép test tiêm vào
// emulator (hoặc một handle giả) thay vì phụ thuộc app Admin SDK khởi tạo ở index.ts.
//
// Đây là phanh chi phí: collection aiUsage chỉ Admin SDK chạm tới (Security Rules chặn
// tuyệt đối client, xem firestore.rules) — một học sinh ghi được document này coi như
// không có quota nào cả.

import { Timestamp, type Firestore } from "firebase-admin/firestore";

/** Lệch giờ Việt Nam so với UTC, tính bằng mili-giây. UTC+7 cố định — không dùng tên múi
 *  giờ (Intl.DateTimeFormat với timeZone) vì Việt Nam không có DST, offset cố định là đúng
 *  và không cần thư viện. Sai múi giờ ở đây nghĩa là quota reset lúc 7 giờ sáng, đúng lúc
 *  học sinh không hiểu vì sao. */
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Fix round 1 cho Task 5 (Finding 1, CRITICAL — spec ❌): trước fix này, MỌI caller dùng
 * chung một document `aiUsage/{uid}_{date}`, bất kể tính năng nào tiêu thụ. Hậu quả: 5 tin
 * chat tiêu hết ngân sách 5 lượt/ngày của phản chiếu, hay ngược lại — hai `quotaStudentPerDay`
 * và `chatQuotaPerDay` không còn nghĩa là "N lượt của TÍNH NĂNG NÀY mỗi ngày" nữa, mà là "một
 * ngân sách chung, ai tiêu trước người đó dùng". Đây là một thay đổi hành vi lên tính năng ĐÃ
 * SHIP (generateReflection.ts) chỉ vì thêm chat.
 *
 * `feature` là phần THỨ HAI của khoá document (`aiUsage/{uid}_{feature}_{date}`) — mỗi tính
 * năng tiêu quota độc lập, không giẫm lên nhau. BẮT BUỘC truyền tường minh ở MỌI call site
 * (không có giá trị mặc định) để một người đọc `generateReflection.ts`/`sendChatMessage.ts`
 * thấy ngay tính năng nào đang tiêu quota nào mà không cần lần theo import.
 */
export type QuotaFeature = "reflection" | "chat";

/** Phần cấu hình quota mà consumeQuota cần — lấy từ AiConfig (systemConfig/aiConfig), chỉ
 *  khai báo đúng hai field dùng tới thay vì phụ thuộc kiểu AiConfig đầy đủ (module này nằm
 *  trong package functions/, tách biệt package web app chứa AiConfig). */
export type QuotaConfig = {
  quotaStudentPerDay: number;
  rateLimitPerMinute: number;
};

export type ConsumeQuotaResult = {
  allowed: boolean;
  reason: "quota" | "rate_limit" | null;
};

/** Hình dạng document aiUsage/{uid}_{feature}_{yyyy-mm-dd}. `feature` được lưu lại (dù đã
 *  nằm sẵn trong id document) — cùng lý do `uid`/`date` cũng được lưu lại dù nằm trong id:
 *  đọc log/console Firestore không phải lúc nào cũng tiện parse ngược lại id. */
type AiUsageDoc = {
  uid: string;
  feature: QuotaFeature;
  date: string;
  count: number;
  updatedAt: Timestamp;
};

/** Tính khoá ngày theo giờ Việt Nam (UTC+7), dạng yyyy-mm-dd, từ một mốc thời gian UTC. */
function vietnamDateKey(now: Date): string {
  const shifted = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Kiểm tra và tiêu thụ quota AI của một học sinh cho một lượt gọi. Trả về allowed=false
 * khi vượt quota trong ngày HOẶC gọi quá gần lượt trước (rate limit) — KHÔNG BAO GIỜ tăng
 * count khi bị từ chối, để một chuỗi lượt gọi bị rate-limit liên tiếp không tự đốt hết
 * quota trong ngày.
 *
 * `now` nhận qua tham số (không dùng `new Date()` trong hàm) để test kiểm soát được cả
 * khoá ngày (giờ VN) lẫn khoảng cách rate limit một cách xác định.
 *
 * `feature` khoá document theo TỪNG tính năng riêng (`aiUsage/{uid}_{feature}_{date}`) — hai
 * tính năng gọi `consumeQuota` với `feature` khác nhau không bao giờ tiêu chung một ngân
 * sách (Fix round 1, Task 5, Finding 1).
 */
export async function consumeQuota(
  db: Firestore,
  uid: string,
  feature: QuotaFeature,
  config: QuotaConfig,
  now: Date,
): Promise<ConsumeQuotaResult> {
  const date = vietnamDateKey(now);
  const docRef = db.collection("aiUsage").doc(`${uid}_${feature}_${date}`);

  return db.runTransaction(async (tx): Promise<ConsumeQuotaResult> => {
    const snap = await tx.get(docRef);
    const existing = snap.exists ? (snap.data() as AiUsageDoc) : null;
    const currentCount = existing?.count ?? 0;

    if (currentCount >= config.quotaStudentPerDay) {
      return { allowed: false, reason: "quota" };
    }

    // QUY ƯỚC NGƯỢC VỚI quotaStudentPerDay Ở TRÊN — cố ý, xem chú thích đầy đủ ở
    // aiConfigSchema (src/lib/types/ai.ts): quotaStudentPerDay = 0 nghĩa là "chặn tất cả"
    // (đó là NGÂN SÁCH của ngày); rateLimitPerMinute chỉ là phanh chống burst TRONG một
    // ngày, không phải ngân sách, nên rateLimitPerMinute <= 0 nghĩa là "không áp rate
    // limit" — bỏ qua hẳn bước kiểm tra bên dưới, KHÔNG suy ra một ngưỡng vô hạn rồi khoá
    // học sinh ở đúng 1 lượt/ngày mãi mãi (đó là bug đã sửa ở fix round 1: admin bật quota
    // lên nhưng quên nâng field này, mọi học sinh bị kẹt 1 lượt/ngày không rõ lý do).
    if (existing && config.rateLimitPerMinute > 0) {
      const minIntervalMs = 60_000 / config.rateLimitPerMinute;
      // M9 (final whole-branch review): comment cũ giải thích Math.abs SAI — "để không bỏ lọt
      // trường hợp hiệu số âm" không đúng: KHÔNG dùng abs, một hiệu số âm luôn nhỏ hơn
      // minIntervalMs (dương) nên tự động rơi vào nhánh từ chối — không hề "bỏ lọt", đó là
      // fail-closed. Nhưng ĐÃ THỬ bỏ abs (xác nhận bằng cách chạy quota.test.ts trên Firestore
      // emulator thật, đặc biệt "20 lượt song song, quota 10"): fail-closed đó chặn nhầm CHÍNH
      // các lượt gọi hợp lệ đang chạy đồng thời. `now` của mỗi lượt là mốc SERVER tự sinh độc
      // lập (generateReflection.ts: `now: new Date()`), không phải giá trị client gửi lên; hai
      // transaction chạy song song có thể commit KHÔNG theo đúng thứ tự `now` của chúng (do cơ
      // chế optimistic concurrency tự retry của Firestore) — một lượt có `now` NHỎ hơn hoàn
      // toàn có thể đọc thấy `existing.updatedAt` của một lượt có `now` LỚN hơn đã commit
      // trước, cho hiệu số âm dù khoảng cách THẬT giữa hai request không hề gần. Giữ Math.abs
      // là quyết định có chủ đích: nó đo đúng "cách nhau bao xa", bất kể thứ tự commit — không
      // phải để "không bỏ lọt", mà để không phạt nhầm các lượt hợp lệ chỉ vì thứ tự commit xáo
      // trộn. Rủi ro đối trọng (updatedAt bị đẩy tới tương lai do lệch đồng hồ máy khách) không
      // áp dụng ở đây vì `now` luôn do server tự sinh, không phải giá trị client kiểm soát.
      const diffMs = Math.abs(now.getTime() - existing.updatedAt.toMillis());
      if (diffMs < minIntervalMs) {
        return { allowed: false, reason: "rate_limit" };
      }
    }

    const nextDoc: AiUsageDoc = {
      uid,
      feature,
      date,
      count: currentCount + 1,
      updatedAt: Timestamp.fromDate(now),
    };
    tx.set(docRef, nextDoc);

    return { allowed: true, reason: null };
  });
}
