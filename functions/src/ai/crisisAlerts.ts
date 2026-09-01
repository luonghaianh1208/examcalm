/**
 * Ghi và chống lụt cảnh báo khủng hoảng.
 *
 * Tách nguyên văn ra khỏi sendChatMessage.ts để bề mặt "Hỏi về web app"
 * (askWebAppHelp.ts) dùng CHUNG đúng logic này. Chép lại sang chỗ mới sẽ tạo
 * ra hai bản chống lụt tách rời, và bản nào lệch đi thì hậu quả là hoặc thầy
 * cô bị ngập cảnh báo, hoặc một tín hiệu nặng hơn không được nâng cấp.
 *
 * Mã bên dưới GIỮ NGUYÊN từ bản đã qua bốn vòng review — chỉ đổi tiền tố trong
 * chuỗi log cho khớp tên module mới.
 */
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

/** Cửa sổ thời gian coi một cảnh báo CHƯA XỬ LÝ là "vẫn còn mới" — trong cửa sổ này, một cảnh
 *  báo thứ hai cho ĐÚNG học sinh đó không được tạo thêm (Fix round 2, Finding 2). "Vài phút" là
 *  khoảng đủ để không tạo ra hai document cho hai tin nhắn liên tiếp trong CÙNG một đợt bộc lộ
 *  khủng hoảng, nhưng không quá dài để một tình huống thật sự MỚI (nhiều phút sau, có thể sau khi
 *  thầy cô đã bắt đầu can thiệp ngoài hệ thống) vẫn tạo được cảnh báo riêng nếu cảnh báo cũ chưa
 *  kịp đánh dấu đã xử lý. CỐ Ý không phải rate limit lên học sinh: tin nhắn của em vẫn được lưu,
 *  CRISIS_REPLY_TEXT vẫn được trả về bình thường mọi lúc — chỉ việc TẠO CẢNH BÁO bị phanh lại.*/
const CRISIS_ALERT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Cảnh báo CHƯA XỬ LÝ gần nhất (nếu có) cho ĐÚNG `userId`, trong `CRISIS_ALERT_DEDUP_WINDOW_MS`
 *  gần nhất. Fix round 3, Finding 1: trả về id VÀ severity (không còn boolean) — caller cần
 *  severity để quyết định NÂNG CẤP hay giữ nguyên, và cần id dù KHÔNG nâng cấp (để biết tin
 *  nhắn hiện tại đang "gắn" với cảnh báo nào, cho khả năng Lớp 2 nâng cấp nó sau này). */
export async function findRecentUnhandledAlert(
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
 *
 * C2 (final whole-branch review, CRITICAL): bước ĐỌC ở trên đã fail-open từ round 3, nhưng bước
 * GHI (`.add()`/`.update()` ngay dưới) trước fix này KHÔNG được bọc — và trên nhánh urgent, hàm
 * này chạy TRƯỚC appendChatMessage. Một lỗi Firestore thoáng qua đúng lúc ghi cảnh báo làm hỏng
 * cả lượt gọi: không tin nào được lưu, học sinh nhận lỗi `internal` KHÔNG kèm marker "saved" —
 * đúng thất bại "khủng hoảng đứng trên trạng thái vận hành" mà round 1 đã sửa, tái diễn thấp hơn
 * một tầng. SỬA: bọc luôn bước ghi — lỗi bị nuốt (log, không throw), trả về `null` thay vì ném.
 * Trả `null` không phân biệt được với "Lớp 1 không phát hiện gì" ở phía caller — ĐÚNG Ý: cả hai
 * đều có nghĩa "không có id cảnh báo nào biết chắc để nâng cấp sau này", và logic gộp hai lớp
 * phía dưới (runSendChatMessage) đã xử lý đúng cho cả hai trường hợp (thử tạo mới nếu Lớp 2 sau
 * đó có tín hiệu, cũng fail-open theo đúng cơ chế này).
 *
 * Finding 2 (final whole-branch review, second pass): trả về CẢ `severity` THẬT SỰ đang được lưu
 * (không chỉ `id`) — trước fix này, caller phải tự nhớ severity nào đã ghi, và khi bị dedup vào
 * MỘT document CÓ SẴN nặng hơn (vd tin hiện tại "concern" gắn vào một alert "urgent" tạo bởi tin
 * trước), caller không có cách nào biết alert đó THẬT SỰ đang ở mức "urgent" — dẫn tới hạ cấp
 * nhầm ở nơi gọi (xem upgradeCrisisAlert bên dưới). Trả về severity thật giải quyết tận gốc.
 */
export async function writeCrisisAlert(
  db: Firestore,
  userId: string,
  severity: "urgent" | "concern",
  triggeredBy: "keyword" | "model" | "both",
  now: Date,
): Promise<{ id: string; severity: "urgent" | "concern" } | null> {
  let existing: { id: string; severity: "urgent" | "concern" } | null = null;
  try {
    existing = await findRecentUnhandledAlert(db, userId, now);
  } catch (error) {
    console.error(
      "crisisAlerts: findRecentUnhandledAlert thất bại — fail-open, vẫn tạo cảnh báo mới",
      { message: error instanceof Error ? error.message : String(error) },
    );
    existing = null;
  }

  try {
    if (existing === null) {
      const ref = await db.collection("crisisAlerts").add({
        userId,
        severity,
        triggeredBy,
        // `Timestamp.fromDate(now)` — KHÔNG dùng FieldValue.serverTimestamp() (khác với
        // appendChatMessage): findRecentUnhandledAlert so `createdAt` với một cửa sổ tính từ
        // CHÍNH `now` này — hai đồng hồ khác nhau khiến so sánh cửa sổ vô nghĩa (Fix round 2,
        // Finding 2).
        createdAt: Timestamp.fromDate(now),
        handledBy: null,
        handledAt: null,
      });
      return { id: ref.id, severity };
    }

    if (isMoreSevere(severity, existing.severity)) {
      await db.collection("crisisAlerts").doc(existing.id).update({ severity, triggeredBy });
      return { id: existing.id, severity };
    }
    // Không nâng cấp — trả về severity THẬT SỰ đang lưu (existing.severity), KHÔNG phải
    // `severity` (giá trị tín hiệu của lượt gọi này, có thể nhẹ hơn) — xem Finding 2 ở trên.
    return { id: existing.id, severity: existing.severity };
  } catch (error) {
    // C2: fail-open trên chính bước GHI — xem comment lớn ở trên hàm này. KHÔNG kèm uid trong
    // log, cùng kỷ luật với console.error khác trong file này.
    console.error(
      "crisisAlerts: ghi/nâng cấp crisisAlerts thất bại — fail-open, KHÔNG làm hỏng lượt gọi",
      { message: error instanceof Error ? error.message : String(error) },
    );
    return null;
  }
}

/** NÂNG CẤP một cảnh báo Lớp 1 đã ghi TRƯỚC đó (id đã biết) lên mức độ NẶNG HƠN kèm
 *  `triggeredBy: "both"` — dùng khi Lớp 2 (biết được sau khi model trả lời) cũng phát tín hiệu
 *  trên CHÍNH tin nhắn đã tạo alert đó (Fix round 2, Finding 1). KHÔNG đi qua
 *  hasRecentUnhandledAlert: đây không phải tạo một document mới, mà hoàn thiện đúng một document
 *  đã tồn tại cho đúng tin nhắn này — phanh chống-lụt (Finding 2) chỉ áp cho việc TẠO mới.
 *
 *  C2 (final whole-branch review): bọc trong try/catch, fail-open — cùng lý do writeCrisisAlert.
 *  Nếu ghi thất bại, cảnh báo đã có (Lớp 1) vẫn còn nguyên ở mức cũ (không mất tín hiệu, chỉ
 *  không được nâng cấp) — KHÔNG được phép làm hỏng lượt gọi chỉ vì bước nâng cấp này lỗi. */
export async function upgradeCrisisAlert(
  db: Firestore,
  alertId: string,
  severity: "urgent" | "concern",
): Promise<void> {
  try {
    await db.collection("crisisAlerts").doc(alertId).update({
      severity,
      triggeredBy: "both",
    });
  } catch (error) {
    console.error(
      "crisisAlerts: upgradeCrisisAlert thất bại — fail-open, KHÔNG làm hỏng lượt gọi",
      { message: error instanceof Error ? error.message : String(error) },
    );
  }
}
