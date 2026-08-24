// Module thuần TypeScript — không import firebase-admin, không đọc Firestore, không state
// mức module — mọi thứ cần thiết nhận qua tham số để test được mà không cần emulator.
//
// Tách output thô của model thành ba phần theo ba nhãn cố định. Nguyên tắc chi phối:
// KHÔNG BAO GIỜ đoán hay tự điền phần thiếu — thiếu một nhãn, hoặc một phần rỗng sau
// khi trim, đều trả về null. Học sinh nhìn thấy một mảnh phản chiếu vỡ còn tệ hơn không
// thấy gì — UI hiển thị phần đó như thể app đang nói chuyện trực tiếp với các em.

/**
 * Ba nhãn cố định phân tách output của model, theo đúng thứ tự xuất hiện.
 * Được export vì Task 5 (xây prompt) phải yêu cầu model xuất ra CHÍNH XÁC các chuỗi
 * này — nếu hardcode một chuỗi khác ở đó, việc tách sẽ âm thầm hỏng ở mọi lần gọi.
 */
export const REFLECTION_LABEL = "PHẢN CHIẾU:";
export const CAT_STORY_LABEL = "CÂU CHUYỆN MÈO:";
export const JOURNAL_PROMPT_LABEL = "CÂU HỎI NHẬT KÝ:";

export type ParsedReflectionOutput = {
  reflectionText: string;
  catStoryText: string;
  journalPrompt: string;
};

/** Escape các ký tự đặc biệt của regex trong một đoạn văn bản thuần. */
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dựng regex khớp một nhãn, neo vào ĐẦU DÒNG (cho phép khoảng trắng/tab đầu dòng và cặp
 * "**" markdown bold mà model hay chèn quanh nhãn), không khớp giữa câu. Đây là điều kiện
 * bắt buộc: "phản chiếu" là một từ tiếng Việt thông thường, có thể xuất hiện tình cờ trong
 * phần mở đầu (preamble) mà model viết thêm trước nhãn thật — nếu không neo vào đầu dòng,
 * việc so khớp chuỗi con đơn giản sẽ bắt nhầm và làm hỏng toàn bộ phần tách.
 */
function buildLabelPattern(label: string): RegExp {
  // Chuẩn hoá NFC trước khi dựng pattern — đồng bộ với safetyFilter.ts, dù hằng số nhãn
  // trong file này vốn đã là NFC, để hai module xử lý input NFC/NFD theo đúng một cách.
  const escaped = escapeRegExp(label.normalize("NFC"));
  return new RegExp(`^[ \\t]*\\*{0,2}${escaped}\\*{0,2}`, "gim");
}

type LabelMatch = { index: number; end: number };

/**
 * Tìm lần khớp nhãn đầu tiên có vị trí bắt đầu >= `fromIndex` — dùng để buộc ba nhãn phải
 * xuất hiện đúng thứ tự: nhãn sau không được tìm thấy ở vị trí nằm trước nội dung của nhãn
 * trước đó.
 */
function findLabelFrom(text: string, label: string, fromIndex: number): LabelMatch | null {
  const pattern = buildLabelPattern(label);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index >= fromIndex) {
      return { index: match.index, end: match.index + match[0].length };
    }
    if (match[0].length === 0) pattern.lastIndex += 1; // tránh vòng lặp vô hạn, phòng hờ
  }
  return null;
}

export function parseReflectionOutput(text: string): ParsedReflectionOutput | null {
  // Chuẩn hoá NFC trước khi so khớp — model có thể trả về tiếng Việt dạng NFD (dấu tổ
  // hợp tách rời), cùng một chữ nhưng khác byte so với hằng số nhãn (vốn là NFC). Chuẩn
  // hoá NGAY TỪ ĐẦU và dùng chuỗi đã chuẩn hoá cho cả so khớp lẫn cắt chuỗi (slice) —
  // nếu chỉ chuẩn hoá bản sao riêng để so khớp mà vẫn cắt trên `text` gốc, độ dài chuỗi
  // đổi sau NFC/NFD sẽ làm lệch vị trí index.
  const normalizedText = text.normalize("NFC");

  const reflectionMatch = findLabelFrom(normalizedText, REFLECTION_LABEL, 0);
  if (reflectionMatch === null) return null;

  // Ba nhãn phải xuất hiện đúng thứ tự: mỗi lần tìm nhãn tiếp theo chỉ chấp nhận vị trí
  // từ cuối nhãn trước trở đi — nhãn nằm trước đó (thứ tự sai) sẽ không được tìm thấy,
  // trả về null thay vì tách sai.
  const catStoryMatch = findLabelFrom(normalizedText, CAT_STORY_LABEL, reflectionMatch.end);
  if (catStoryMatch === null) return null;

  const journalPromptMatch = findLabelFrom(normalizedText, JOURNAL_PROMPT_LABEL, catStoryMatch.end);
  if (journalPromptMatch === null) return null;

  // Văn bản thừa trước nhãn đầu tiên tự động bị bỏ qua vì reflectionText chỉ lấy từ sau
  // reflectionMatch.end trở đi, không bao giờ nhìn về phía trước reflectionMatch.index.
  const reflectionText = normalizedText.slice(reflectionMatch.end, catStoryMatch.index).trim();
  const catStoryText = normalizedText.slice(catStoryMatch.end, journalPromptMatch.index).trim();
  const journalPrompt = normalizedText.slice(journalPromptMatch.end).trim();

  if (reflectionText === "" || catStoryText === "" || journalPrompt === "") return null;

  return { reflectionText, catStoryText, journalPrompt };
}
