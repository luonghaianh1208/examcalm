import { describe, it, expect } from "vitest";
import {
  parseReflectionOutput,
  REFLECTION_LABEL,
  CAT_STORY_LABEL,
  JOURNAL_PROMPT_LABEL,
} from "./parseOutput";

/** Ghép ba phần theo đúng thứ tự nhãn, mô phỏng output chuẩn của model. */
function buildOutput(reflection: string, catStory: string, journalPrompt: string): string {
  return `${REFLECTION_LABEL}\n${reflection}\n${CAT_STORY_LABEL}\n${catStory}\n${JOURNAL_PROMPT_LABEL}\n${journalPrompt}`;
}

describe("parseReflectionOutput", () => {
  it("case 1: output đúng định dạng ba nhãn → tách đủ ba phần, đã trim()", () => {
    const text = buildOutput(
      "  Bạn đã rất cố gắng trong tuần này.  ",
      "  Chú mèo nhỏ cũng từng sợ kỳ thi đầu tiên.  ",
      "  Điều gì khiến bạn thấy an tâm nhất lúc này?  ",
    );

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Bạn đã rất cố gắng trong tuần này.",
      catStoryText: "Chú mèo nhỏ cũng từng sợ kỳ thi đầu tiên.",
      journalPrompt: "Điều gì khiến bạn thấy an tâm nhất lúc này?",
    });
  });

  it("case 2: thiếu một nhãn → trả null", () => {
    const text = `${REFLECTION_LABEL}\nNội dung phản chiếu.\n${JOURNAL_PROMPT_LABEL}\nCâu hỏi nhật ký.`;

    expect(parseReflectionOutput(text)).toBeNull();
  });

  it("case 3: nhãn viết hoa/thường khác nhau vẫn nhận ra", () => {
    const text = [
      REFLECTION_LABEL.toLowerCase(),
      "Nội dung phản chiếu.",
      CAT_STORY_LABEL.toUpperCase(),
      "Câu chuyện mèo.",
      JOURNAL_PROMPT_LABEL.toLowerCase(),
      "Câu hỏi nhật ký.",
    ].join("\n");

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Nội dung phản chiếu.",
      catStoryText: "Câu chuyện mèo.",
      journalPrompt: "Câu hỏi nhật ký.",
    });
  });

  it("case 4: có văn bản thừa trước nhãn đầu tiên → bỏ qua phần thừa, vẫn tách đúng", () => {
    const text = `Đây là văn bản thừa không liên quan.\n${buildOutput(
      "Nội dung phản chiếu.",
      "Câu chuyện mèo.",
      "Câu hỏi nhật ký.",
    )}`;

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Nội dung phản chiếu.",
      catStoryText: "Câu chuyện mèo.",
      journalPrompt: "Câu hỏi nhật ký.",
    });
  });

  it("case 5: một phần rỗng sau khi trim → trả null", () => {
    const text = buildOutput("   ", "Câu chuyện mèo.", "Câu hỏi nhật ký.");

    expect(parseReflectionOutput(text)).toBeNull();
  });

  it("case 6: chuỗi rỗng → null", () => {
    expect(parseReflectionOutput("")).toBeNull();
  });

  // Fix round 1 — Finding 4 (Important): nhãn phải neo vào đầu dòng, không khớp giữa câu.
  it("case 7: preamble chứa từ 'phản chiếu' giữa câu trước nhãn thật vẫn tách đúng bằng nhãn thật", () => {
    const text = [
      "Đây là một bài phản chiếu: hãy cùng xem xét.",
      buildOutput("Nội dung phản chiếu thật.", "Câu chuyện mèo.", "Câu hỏi nhật ký."),
    ].join("\n");

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Nội dung phản chiếu thật.",
      catStoryText: "Câu chuyện mèo.",
      journalPrompt: "Câu hỏi nhật ký.",
    });
  });

  it("case 8: nhãn bọc trong ** (markdown bold) vẫn nhận ra", () => {
    const text = [
      `**${REFLECTION_LABEL}**`,
      "Nội dung phản chiếu.",
      `**${CAT_STORY_LABEL}**`,
      "Câu chuyện mèo.",
      `**${JOURNAL_PROMPT_LABEL}**`,
      "Câu hỏi nhật ký.",
    ].join("\n");

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Nội dung phản chiếu.",
      catStoryText: "Câu chuyện mèo.",
      journalPrompt: "Câu hỏi nhật ký.",
    });
  });

  it("case 9: nhãn xuất hiện sai thứ tự → null", () => {
    const text = [
      CAT_STORY_LABEL,
      "Câu chuyện mèo.",
      REFLECTION_LABEL,
      "Nội dung phản chiếu.",
      JOURNAL_PROMPT_LABEL,
      "Câu hỏi nhật ký.",
    ].join("\n");

    expect(parseReflectionOutput(text)).toBeNull();
  });

  // Fix round 2 — nhãn ở dạng NFD (dấu tổ hợp tách rời) vẫn phải nhận ra, vì model có thể
  // trả tiếng Việt ở dạng NFD trong khi hằng số nhãn trong source là NFC.
  it("case 10: nhãn ở dạng NFD (byte khác nhưng cùng chữ hiển thị) vẫn tách đúng", () => {
    const text = [
      REFLECTION_LABEL.normalize("NFD"),
      "Nội dung phản chiếu.",
      CAT_STORY_LABEL.normalize("NFD"),
      "Câu chuyện mèo.",
      JOURNAL_PROMPT_LABEL.normalize("NFD"),
      "Câu hỏi nhật ký.",
    ].join("\n");

    const result = parseReflectionOutput(text);

    expect(result).toEqual({
      reflectionText: "Nội dung phản chiếu.",
      catStoryText: "Câu chuyện mèo.",
      journalPrompt: "Câu hỏi nhật ký.",
    });
  });
});
