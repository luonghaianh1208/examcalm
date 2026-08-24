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

/** Tìm vị trí đầu tiên của `label` trong `text` kể từ `fromIndex`, không phân biệt hoa/thường. */
function findLabelIndex(text: string, label: string, fromIndex: number): number {
  return text.toLowerCase().indexOf(label.toLowerCase(), fromIndex);
}

export function parseReflectionOutput(text: string): ParsedReflectionOutput | null {
  const reflectionStart = findLabelIndex(text, REFLECTION_LABEL, 0);
  if (reflectionStart === -1) return null;
  const reflectionContentStart = reflectionStart + REFLECTION_LABEL.length;

  const catStoryStart = findLabelIndex(text, CAT_STORY_LABEL, reflectionContentStart);
  if (catStoryStart === -1) return null;
  const catStoryContentStart = catStoryStart + CAT_STORY_LABEL.length;

  const journalPromptStart = findLabelIndex(text, JOURNAL_PROMPT_LABEL, catStoryContentStart);
  if (journalPromptStart === -1) return null;
  const journalPromptContentStart = journalPromptStart + JOURNAL_PROMPT_LABEL.length;

  // Văn bản thừa trước nhãn đầu tiên tự động bị bỏ qua vì reflectionText chỉ lấy từ sau
  // reflectionContentStart trở đi, không bao giờ nhìn về phía trước reflectionStart.
  const reflectionText = text.slice(reflectionContentStart, catStoryStart).trim();
  const catStoryText = text.slice(catStoryContentStart, journalPromptStart).trim();
  const journalPrompt = text.slice(journalPromptContentStart).trim();

  if (reflectionText === "" || catStoryText === "" || journalPrompt === "") return null;

  return { reflectionText, catStoryText, journalPrompt };
}
