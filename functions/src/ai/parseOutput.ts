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
  const escaped = escapeRegExp(label);
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
  const reflectionMatch = findLabelFrom(text, REFLECTION_LABEL, 0);
  if (reflectionMatch === null) return null;

  // Ba nhãn phải xuất hiện đúng thứ tự: mỗi lần tìm nhãn tiếp theo chỉ chấp nhận vị trí
  // từ cuối nhãn trước trở đi — nhãn nằm trước đó (thứ tự sai) sẽ không được tìm thấy,
  // trả về null thay vì tách sai.
  const catStoryMatch = findLabelFrom(text, CAT_STORY_LABEL, reflectionMatch.end);
  if (catStoryMatch === null) return null;

  const journalPromptMatch = findLabelFrom(text, JOURNAL_PROMPT_LABEL, catStoryMatch.end);
  if (journalPromptMatch === null) return null;

  // Văn bản thừa trước nhãn đầu tiên tự động bị bỏ qua vì reflectionText chỉ lấy từ sau
  // reflectionMatch.end trở đi, không bao giờ nhìn về phía trước reflectionMatch.index.
  const reflectionText = text.slice(reflectionMatch.end, catStoryMatch.index).trim();
  const catStoryText = text.slice(catStoryMatch.end, journalPromptMatch.index).trim();
  const journalPrompt = text.slice(journalPromptMatch.end).trim();

  if (reflectionText === "" || catStoryText === "" || journalPrompt === "") return null;

  return { reflectionText, catStoryText, journalPrompt };
}
