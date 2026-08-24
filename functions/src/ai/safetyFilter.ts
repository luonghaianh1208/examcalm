// Bộ lọc thuần TypeScript — không import firebase-admin, không đọc Firestore, không state
// mức module — mọi thứ cần thiết nhận qua tham số để test được mà không cần emulator.
//
// Đây là chốt chặn cuối cùng giữa model và học sinh. Chỉ người có chuyên môn (bác sĩ,
// chuyên gia tâm lý) mới được phép gọi tên một tình trạng sức khoẻ tâm thần cho ai đó.
// Model không phải người có chuyên môn, nên hễ output của nó chạm tới ngôn ngữ chẩn đoán
// là phải chặn — kể cả khi nghi ngờ. Bỏ sót một phản chiếu vô hại không tốn gì; để lọt một
// câu "gán bệnh" tới một học sinh lớp 12 thì có thể gây hại thật.

/**
 * Danh sách từ khoá chẩn đoán bị cấm xuất hiện trong output gửi tới học sinh.
 * Đây KHÔNG phải kiểm duyệt tuỳ tiện — đây là ranh giới giữa "phản chiếu cảm xúc"
 * (việc app được phép làm) và "chẩn đoán/gán nhãn bệnh tâm lý" (việc chỉ chuyên gia
 * được phép làm). Mỗi từ trong danh sách này là một cách model có thể vô tình vượt
 * qua ranh giới đó.
 */
export const BANNED_DIAGNOSTIC_KEYWORDS: readonly string[] = [
  "rối loạn lo âu",
  "trầm cảm",
  "chẩn đoán",
  "bệnh tâm lý",
  "triệu chứng",
];

// Các cụm phủ định đứng ngay trước từ khoá khiến từ khoá đó không còn là một tuyên bố
// chẩn đoán nữa, mà là câu miễn trừ trách nhiệm (VD: "không phải chẩn đoán"). Xử lý
// tường minh ở đây thay vì bỏ "chẩn đoán" ra khỏi danh sách cấm — vì "chẩn đoán" vẫn
// phải bị chặn trong mọi ngữ cảnh khác.
const NEGATION_PREFIXES: readonly string[] = ["không phải là ", "không phải "];

/** Kiểm tra xem vị trí `matchIndex` trong `normalizedText` có được phủ định ngay trước không. */
function isNegatedAt(normalizedText: string, matchIndex: number): boolean {
  const before = normalizedText.slice(0, matchIndex);
  return NEGATION_PREFIXES.some((prefix) => before.endsWith(prefix));
}

export function checkOutputSafety(text: string): { safe: boolean; reason: string | null } {
  if (text.length === 0) {
    return { safe: false, reason: "Văn bản rỗng — không thể xác nhận an toàn, mặc định chặn." };
  }

  // Chuẩn hoá NFC + lowercase trước khi so khớp: tiếng Việt có thể tới dưới dạng NFC
  // hoặc NFD (dấu tổ hợp tách rời), cùng một chữ nhưng khác byte — so khớp phải bất biến
  // với cả hai dạng và không phân biệt hoa thường.
  const normalized = text.normalize("NFC").toLowerCase();

  for (const keyword of BANNED_DIAGNOSTIC_KEYWORDS) {
    const normalizedKeyword = keyword.normalize("NFC").toLowerCase();

    let searchFrom = 0;
    for (;;) {
      const matchIndex = normalized.indexOf(normalizedKeyword, searchFrom);
      if (matchIndex === -1) break;

      if (!isNegatedAt(normalized, matchIndex)) {
        return {
          safe: false,
          reason: `Phát hiện từ khoá chẩn đoán bị cấm: "${keyword}".`,
        };
      }

      searchFrom = matchIndex + normalizedKeyword.length;
    }
  }

  return { safe: true, reason: null };
}
