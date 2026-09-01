import { describe, expect, it, vi } from "vitest";
import { decideModeration, runModerateConfession } from "./moderateConfession";
import { DEFAULT_AI_CONFIG, type AiConfig } from "../ai/config";
import type { Firestore } from "firebase-admin/firestore";

const CAU_HINH_DAY_DU: AiConfig = {
  ...DEFAULT_AI_CONFIG,
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
};

const KEY = "key-gia";

function modelTraVe(text: string) {
  return vi.fn(async () => ({ text, finishReason: "stop" }));
}

describe("decideModeration — mặc định an toàn là GIỮ LẠI", () => {
  it("chưa cấu hình provider thì giữ lại, KHÔNG công khai", async () => {
    const r = await decideModeration("bài bình thường", DEFAULT_AI_CONFIG, "", modelTraVe("AN_TOAN"));
    expect(r.status).toBe("hold");
  });

  it("thiếu API key thì giữ lại", async () => {
    const r = await decideModeration("bài bình thường", CAU_HINH_DAY_DU, "", modelTraVe("AN_TOAN"));
    expect(r.status).toBe("hold");
  });

  // Provider loi KHONG duoc bien thanh "cho qua".
  it("provider lỗi thì giữ lại", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const hong = vi.fn(async () => { throw new Error("mạng lỗi"); });
    const r = await decideModeration("bài bình thường", CAU_HINH_DAY_DU, KEY, hong);
    expect(r.status).toBe("hold");
    spy.mockRestore();
  });

  it("chỉ đúng từ khoá an toàn mới cho qua", async () => {
    const ok = await decideModeration("ok", CAU_HINH_DAY_DU, KEY, modelTraVe("AN_TOAN"));
    expect(ok.status).toBe("auto_approved");
  });

  it("chấp nhận khoảng trắng và chữ thường quanh từ khoá", async () => {
    const r = await decideModeration("ok", CAU_HINH_DAY_DU, KEY, modelTraVe("  an_toan\n"));
    expect(r.status).toBe("auto_approved");
  });

  // Mô hình trả lời dài dòng, bằng tiếng Anh, hay rỗng đều phải rơi về hold —
  // đây là lớp chặn khi mô hình không tuân thủ định dạng được yêu cầu.
  it.each(["GIU_LAI", "SAFE", "Bài này an toàn nhé", "", "AN_TOAN nhưng cần xem lại"])(
    "trả lời %o thì giữ lại",
    async (traLoi) => {
      const r = await decideModeration("ok", CAU_HINH_DAY_DU, KEY, modelTraVe(traLoi));
      expect(r.status).toBe("hold");
    },
  );
});

/** Firestore giả: ghi lại mọi update/set để kiểm chính xác cái gì đã ghi. */
function fakeDb() {
  const updates: Array<{ path: string; data: unknown }> = [];
  const sets: Array<{ path: string; data: unknown }> = [];
  const alerts: unknown[] = [];

  const db = {
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: false, data: () => undefined }),
        update: async (data: unknown) => { updates.push({ path: `${col}/${id}`, data }); },
        set: async (data: unknown) => { sets.push({ path: `${col}/${id}`, data }); },
      }),
      where: () => ({
        where: () => ({
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
        }),
      }),
      add: async (doc: unknown) => { alerts.push(doc); return { id: "alert-1" }; },
    }),
  } as unknown as Firestore;

  return { db, updates, sets, alerts };
}

describe("runModerateConfession", () => {
  it("chưa cấu hình AI: ghi hold, KHÔNG ghi bản công khai", async () => {
    const { db, updates, sets } = fakeDb();
    const r = await runModerateConfession("c1", { authorUid: "u1", textContent: "chào" }, { db });

    expect(r.status).toBe("hold");
    expect(updates[0]?.path).toBe("confessions/c1");
    // Không có gì được ghi sang collection công khai.
    expect(sets).toHaveLength(0);
  });

  it("AI nói an toàn: ghi bản công khai CHỈ với hai field, KHÔNG có authorUid", async () => {
    const { db, sets } = fakeDb();
    // Cấu hình đọc từ Firestore đang rỗng nên phải bơm qua callModel + apiKey
    // và một db trả về cấu hình đầy đủ.
    const dbCoCauHinh = {
      ...db,
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => ({
            exists: col === "systemConfig",
            data: () => (col === "systemConfig" ? CAU_HINH_DAY_DU : undefined),
          }),
          update: async () => undefined,
          set: async (data: unknown) => { sets.push({ path: `${col}/${id}`, data }); },
        }),
        where: () => ({
          where: () => ({
            where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
          }),
        }),
        add: async () => ({ id: "alert-1" }),
      }),
    } as unknown as Firestore;

    const r = await runModerateConfession(
      "c2",
      { authorUid: "u1", textContent: "Hôm nay mình học được nhiều." },
      { db: dbCoCauHinh, apiKey: KEY, callModel: modelTraVe("AN_TOAN") },
    );

    expect(r.status).toBe("auto_approved");
    const cong = sets.find((s) => s.path.startsWith("confessionsPublic/"));
    expect(cong).toBeDefined();
    // Rào chắn quan trọng nhất của cả tính năng: bản công khai KHÔNG mang danh tính.
    expect(Object.keys(cong!.data as object).sort()).toEqual(
      ["createdAt", "reportCount", "textContent"].sort(),
    );
    expect(JSON.stringify(cong!.data)).not.toContain("u1");
  });

  it("bài có dấu hiệu khủng hoảng: báo thầy cô VÀ giữ lại, dù AI nói an toàn", async () => {
    const { db, sets, alerts } = fakeDb();
    const dbCoCauHinh = {
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => ({
            exists: col === "systemConfig",
            data: () => (col === "systemConfig" ? CAU_HINH_DAY_DU : undefined),
          }),
          update: async () => undefined,
          set: async (data: unknown) => { sets.push({ path: `${col}/${id}`, data }); },
        }),
        where: () => ({
          where: () => ({
            where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
          }),
        }),
        add: async (doc: unknown) => { alerts.push(doc); return { id: "alert-1" }; },
      }),
    } as unknown as Firestore;

    const r = await runModerateConfession(
      "c3",
      { authorUid: "u1", textContent: "em muốn chết" },
      { db: dbCoCauHinh, apiKey: KEY, callModel: modelTraVe("AN_TOAN") },
    );

    // Ghi đè cuối cùng: không đường nào vòng qua được.
    expect(r.status).toBe("hold");
    expect(alerts).toHaveLength(1);
    expect(sets.some((s) => s.path.startsWith("confessionsPublic/"))).toBe(false);
  });
});
