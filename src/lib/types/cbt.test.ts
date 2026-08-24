import { describe, expect, it } from "vitest";
import { cbtModuleSchema, cbtSessionSchema } from "@/lib/types/cbt";

const MODULE = {
  title: "Nhận diện suy nghĩ tiêu cực",
  version: 1,
  status: "draft" as const,
  isSampleContent: true,
  disclaimer: "Bài tập tự nhận thức, không thay thế chuyên gia.",
  intro: "Bài này giúp bạn nhìn lại một suy nghĩ đang làm bạn lo.",
  steps: [{ id: "s1", prompt: "Suy nghĩ nào đang lặp lại?", hint: "Viết đúng câu bạn nghĩ." }],
  closingText: "Cảm ơn bạn đã dành thời gian.",
  suggestedResourceSlugs: ["ky-thuat-tho-4-7-8"],
  updatedBy: "admin-uid",
};

describe("cbtModuleSchema", () => {
  it("chấp nhận module hợp lệ", () => {
    expect(cbtModuleSchema.safeParse(MODULE).success).toBe(true);
  });

  it("từ chối disclaimer rỗng", () => {
    expect(cbtModuleSchema.safeParse({ ...MODULE, disclaimer: "" }).success).toBe(false);
  });

  it("từ chối module không có bước nào", () => {
    expect(cbtModuleSchema.safeParse({ ...MODULE, steps: [] }).success).toBe(false);
  });

  it("từ chối id bước rỗng", () => {
    const bad = { ...MODULE, steps: [{ id: "", prompt: "a", hint: "b" }] };
    expect(cbtModuleSchema.safeParse(bad).success).toBe(false);
  });
});

describe("cbtSessionSchema", () => {
  it("chấp nhận session hợp lệ", () => {
    const ok = {
      userId: "u1", moduleId: "m1", moduleVersion: 1,
      answers: { s1: "Mình sợ trượt." }, summary: "Mình đang khắt khe với bản thân.",
    };
    expect(cbtSessionSchema.safeParse(ok).success).toBe(true);
  });

  it("chấp nhận summary rỗng — học sinh được quyền bỏ qua", () => {
    const ok = {
      userId: "u1", moduleId: "m1", moduleVersion: 1,
      answers: { s1: "a" }, summary: "",
    };
    expect(cbtSessionSchema.safeParse(ok).success).toBe(true);
  });

  it("từ chối userId rỗng", () => {
    const bad = { userId: "", moduleId: "m1", moduleVersion: 1, answers: {}, summary: "" };
    expect(cbtSessionSchema.safeParse(bad).success).toBe(false);
  });
});
