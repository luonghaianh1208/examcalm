import { describe, it, expect, vi } from "vitest";
import { parseTestDraft, validateTestDraft } from "./admin-tests";

vi.mock("@/lib/firebase/client", () => ({ getDb: vi.fn(() => ({})), ensureAuthReady: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(),
  addDoc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

const HOP_LE = {
  title: "Thang do mau",
  version: 1,
  isSampleContent: true,
  disclaimer: "Khong thay the chuyen gia.",
  questions: [
    { id: "q1", text: "Cau 1", options: [{ label: "Khong", score: 0 }, { label: "Co", score: 1 }] },
  ],
  scoring: { thresholds: [{ min: 0, max: 1, level: "Nhe", interpretation: "Dien giai" }] },
};

/**
 * validateTestDraft() nhan OBJECT chu khong nhan chuoi JSON — cung ly do voi
 * validateCbtDraft: form nhap lieu va o "Dan JSON" phai dung chung mot bo luat.
 */
describe("validateTestDraft", () => {
  it("chap nhan draft hop le", () => {
    expect(validateTestDraft(HOP_LE).ok).toBe(true);
  });

  it("tu choi cau hoi co duoi 2 phuong an", () => {
    const kq = validateTestDraft({
      ...HOP_LE,
      questions: [{ id: "q1", text: "Cau 1", options: [{ label: "Chi mot", score: 0 }] }],
    });
    expect(kq.ok).toBe(false);
  });

  it("tu choi khi hai cau hoi trung id — dap an hoc sinh khoa theo id", () => {
    const kq = validateTestDraft({
      ...HOP_LE,
      questions: [HOP_LE.questions[0], { ...HOP_LE.questions[0], text: "Cau 2" }],
    });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain("trùng id");
  });

  it("tu choi nguong co min lon hon max", () => {
    const kq = validateTestDraft({
      ...HOP_LE,
      scoring: { thresholds: [{ min: 5, max: 1, level: "Nang", interpretation: "X" }] },
    });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain("Nang");
  });
});

describe("parseTestDraft", () => {
  it("bao loi cu phap rieng khi chuoi khong phai JSON", () => {
    const kq = parseTestDraft("{khong phai json");
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain("cú pháp");
  });
});
