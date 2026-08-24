import { describe, expect, it } from "vitest";
import { parseCbtDraft } from "@/lib/firestore/admin-cbt";

const VALID = JSON.stringify({
  title: "Bài mẫu", version: 1, isSampleContent: true,
  disclaimer: "Không thay thế chuyên gia.", intro: "Giới thiệu",
  steps: [{ id: "s1", prompt: "Bạn nghĩ gì?", hint: "" }],
  closingText: "Cảm ơn.", suggestedResourceSlugs: [],
});

describe("parseCbtDraft", () => {
  it("chấp nhận JSON hợp lệ", () => {
    expect(parseCbtDraft(VALID).ok).toBe(true);
  });

  it("báo lỗi cú pháp trước lỗi schema", () => {
    const r = parseCbtDraft("{ title: }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cú pháp/i);
  });

  it("báo đường dẫn field khi sai schema", () => {
    const r = parseCbtDraft(JSON.stringify({ title: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/title/);
  });

  it("từ chối bước trùng id", () => {
    const bad = JSON.parse(VALID);
    bad.steps = [{ id: "s1", prompt: "a", hint: "" }, { id: "s1", prompt: "b", hint: "" }];
    const r = parseCbtDraft(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trùng id/i);
  });

  it("từ chối module không có bước nào", () => {
    const bad = JSON.parse(VALID);
    bad.steps = [];
    expect(parseCbtDraft(JSON.stringify(bad)).ok).toBe(false);
  });
});
