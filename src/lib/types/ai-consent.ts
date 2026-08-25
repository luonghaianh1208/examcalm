/**
 * Phiên bản đồng ý dùng AI hiện tại (I4, final whole-branch review).
 *
 * `privacySettings.aiOptIn` là MỘT field boolean duy nhất — khi Spec #4 (chat) bật lên cho một
 * trường đã dùng Spec #3 (phản chiếu) từ trước, mọi học sinh đã tick `aiOptIn=true` dưới hộp
 * thoại CŨ (chưa từng nhắc chat, chưa từng nhắc đường cảnh báo tới thầy cô) lập tức được coi là
 * đã đồng ý dùng CHAT — không có gì hỏi lại, không có thông báo. Đó không phải đồng ý có hiểu
 * biết (informed consent) cho chat.
 *
 * `privacySettings.aiConsentVersion` (số nguyên, ghi kèm `aiOptIn=true` mỗi lần học sinh xác
 * nhận đồng ý — xem AiConsentSection.tsx::handleConfirmOn) đánh dấu HỘP THOẠI nào học sinh đã
 * thực sự đọc:
 *   - 1: hộp thoại chỉ nói về ghi chú cảm xúc/phản chiếu (Spec #3, trước khi field này tồn tại
 *     — một document CŨ thiếu hẳn field này coi như version 1, xem hasCurrentAiConsent bên
 *     dưới).
 *   - 2 (CURRENT_AI_CONSENT_VERSION): hộp thoại nói rõ CẢ nội dung trò chuyện lẫn đường cảnh
 *     báo an toàn tới thầy cô (Spec #4).
 *
 * Đồng ý version 1 VẪN đủ cho phản chiếu (không có gì thay đổi ở đó — phạm vi dữ liệu gửi đi
 * không đổi) — CHỈ chat mới đòi version hiện tại, vì chat là thứ mới xuất hiện SAU đồng ý đó.
 */
export const CURRENT_AI_CONSENT_VERSION = 2;

/**
 * true nếu đồng ý đã lưu đủ MỚI để dùng chat — `aiOptIn` phải bật VÀ `aiConsentVersion` phải
 * đạt `CURRENT_AI_CONSENT_VERSION`. Nhận `aiConsentVersion` dạng `number | null | undefined`
 * (Firestore field vắng mặt ở các document cũ) — vắng mặt coi như version 1 (KHÔNG đủ cho
 * chat), không phải throw hay coi như "đã đồng ý mọi thứ".
 */
export function hasCurrentAiConsent(
  aiOptIn: boolean,
  aiConsentVersion: number | null | undefined,
): boolean {
  return aiOptIn && typeof aiConsentVersion === "number" && aiConsentVersion >= CURRENT_AI_CONSENT_VERSION;
}
