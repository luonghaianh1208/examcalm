import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type FakeDocSnap = { exists: boolean };
type Write = { id: string; data: Record<string, unknown> };

const existing = new Map<string, FakeDocSnap>();
const writes: Write[] = [];
/** Khi true, get() ném lỗi — mô phỏng Firestore trục trặc. */
let getShouldThrow = false;

const adminDbMock = vi.fn(() => ({
  collection: (name: string) => {
    expect(name).toBe("users");
    return {
      doc: (id: string) => ({
        get: async () => {
          if (getShouldThrow) throw new Error("firestore trục trặc");
          return existing.get(id) ?? { exists: false };
        },
        create: async (data: Record<string, unknown>) => {
          writes.push({ id, data });
        },
      }),
    };
  },
}));

vi.mock("@/lib/firebase/admin", () => ({ adminDb: adminDbMock }));

const { ensureUserProfile } = await import("./ensure-user-profile");

beforeEach(() => {
  existing.clear();
  writes.length = 0;
  getShouldThrow = false;
  adminDbMock.mockClear();
});

describe("ensureUserProfile", () => {
  it("uid chưa có hồ sơ -> tạo hồ sơ với role đúng và privacySettings mặc định", async () => {
    await ensureUserProfile("uid-1", "admin", "quan.tri@truong.edu.vn");

    expect(writes).toHaveLength(1);
    const written = writes[0]!.data;
    expect(writes[0]!.id).toBe("uid-1");
    expect(written.uid).toBe("uid-1");
    expect(written.role).toBe("admin");
    expect(written.privacySettings).toEqual({ aiOptIn: false, shareImageWithAI: false });
    expect(written.researchConsent).toBeNull();
    expect(written.deletionRequestedAt).toBeNull();
  });

  it("lấy role từ tham số (không mặc định student) — admin vẫn là admin", async () => {
    await ensureUserProfile("uid-admin", "admin", "a@b.com");
    expect(writes[0]!.data.role).toBe("admin");
  });

  it("student vẫn ghi đúng role student", async () => {
    await ensureUserProfile("uid-student", "student", "hoc.sinh@truong.edu.vn");
    expect(writes[0]!.data.role).toBe("student");
  });

  it("biệt danh lấy từ phần trước @ của email", async () => {
    await ensureUserProfile("uid-2", "student", "nguyenvana@gmail.com");
    expect(writes[0]!.data.nickname).toBe("nguyenvana");
  });

  it("không có email -> biệt danh vẫn có giá trị (không rỗng)", async () => {
    await ensureUserProfile("uid-3", "student", null);
    expect(typeof writes[0]!.data.nickname).toBe("string");
    expect((writes[0]!.data.nickname as string).length).toBeGreaterThan(0);
  });

  it("school là placeholder tiếng Việt rõ ràng — không bịa tên trường", async () => {
    await ensureUserProfile("uid-4", "student", "x@y.com");
    const school = writes[0]!.data.school as string;
    expect(school).toBe("(chưa cập nhật trường)");
  });

  it("uid ĐÃ có hồ sơ -> KHÔNG ghi gì cả (không ghi đè)", async () => {
    existing.set("uid-existing", { exists: true });
    await ensureUserProfile("uid-existing", "student", "co@san.com");
    expect(writes).toHaveLength(0);
  });

  it("Firestore lỗi -> không ném ra ngoài (không được chặn đăng nhập)", async () => {
    getShouldThrow = true;
    await expect(ensureUserProfile("uid-err", "student", "e@e.com")).resolves.toBeUndefined();
    expect(writes).toHaveLength(0);
  });
});
