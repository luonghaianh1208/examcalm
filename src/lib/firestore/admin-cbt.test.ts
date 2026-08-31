import { describe, it, expect, vi } from "vitest";
import { parseCbtDraft, validateCbtDraft } from "./admin-cbt";

vi.mock("@/lib/firebase/client", () => ({ getDb: vi.fn(() => ({})), ensureAuthReady: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(),
  addDoc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

const HOP_LE = {
  title: "Bai tap mau",
  version: 1,
  isSampleContent: true,
  disclaimer: "Khong thay the chuyen gia.",
  intro: "",
  steps: [{ id: "s1", prompt: "Cau hoi 1", hint: "" }],
  closingText: "",
  suggestedResourceSlugs: [],
};

/**
 * validateCbtDraft() nhan OBJECT chu khong nhan chuoi JSON: form nhap lieu
 * dung chung dung bo luat nay voi o "Dan JSON", nen luat chi duoc viet MOT lan.
 * parseCbtDraft() gio chi con lo phan doc JSON roi uy quyen xuong.
 */
describe("validateCbtDraft", () => {
  it("chap nhan draft hop le", () => {
    const kq = validateCbtDraft(HOP_LE);
    expect(kq.ok).toBe(true);
  });

  it("tu choi khi thieu tieu de", () => {
    const kq = validateCbtDraft({ ...HOP_LE, title: "" });
    expect(kq.ok).toBe(false);
  });

  it("tu choi khi khong co buoc nao", () => {
    const kq = validateCbtDraft({ ...HOP_LE, steps: [] });
    expect(kq.ok).toBe(false);
  });

  it("tu choi khi hai buoc trung id — cau tra loi hoc sinh khoa theo id", () => {
    const kq = validateCbtDraft({
      ...HOP_LE,
      steps: [
        { id: "s1", prompt: "Cau 1", hint: "" },
        { id: "s1", prompt: "Cau 2", hint: "" },
      ],
    });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain("trùng id");
  });
});

describe("parseCbtDraft", () => {
  it("bao loi cu phap rieng khi chuoi khong phai JSON", () => {
    const kq = parseCbtDraft("{khong phai json");
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain("cú pháp");
  });

  it("van kiem tra bang dung bo luat cua validateCbtDraft", () => {
    const kq = parseCbtDraft(JSON.stringify({ ...HOP_LE, steps: [] }));
    expect(kq.ok).toBe(false);
  });
});
