import { describe, expect, it, vi } from "vitest";
import { runAskWebAppHelp } from "./askWebAppHelp";
import { CRISIS_REPLY_TEXT } from "./buildChatPrompt";
import type { Firestore } from "firebase-admin/firestore";

const AUTH = { uid: "u1", emailVerified: true };
const NOW = new Date("2026-09-01T10:00:00Z");

/** Firestore giả chỉ đủ cho writeCrisisAlert: query rỗng rồi add(). */
function fakeDb() {
  const added: unknown[] = [];
  const db = {
    collection: () => ({
      where: () => ({
        where: () => ({
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
        }),
      }),
      add: async (doc: unknown) => {
        added.push(doc);
        return { id: "alert-1" };
      },
      doc: () => ({ update: async () => undefined }),
    }),
  } as unknown as Firestore;
  return { db, added };
}

describe("runAskWebAppHelp — cổng vào", () => {
  it("chưa đăng nhập thì từ chối", async () => {
    await expect(runAskWebAppHelp({ question: "nhật ký ở đâu" }, undefined)).rejects.toThrow(
      /đăng nhập/i,
    );
  });

  it("chưa xác thực email thì từ chối", async () => {
    await expect(
      runAskWebAppHelp({ question: "nhật ký ở đâu" }, { uid: "u1", emailVerified: false }),
    ).rejects.toThrow(/xác thực email/i);
  });

  it("câu hỏi rỗng hoặc quá dài thì từ chối", async () => {
    const { db } = fakeDb();
    await expect(runAskWebAppHelp({ question: "" }, AUTH, { db })).rejects.toThrow(/trống|dài/i);
    await expect(
      runAskWebAppHelp({ question: "a".repeat(501) }, AUTH, { db }),
    ).rejects.toThrow(/trống|dài/i);
  });
});

describe("runAskWebAppHelp — trả lời FAQ", () => {
  it("trả về câu trả lời kèm đường dẫn tới đúng màn hình", async () => {
    const { db } = fakeDb();
    const r = await runAskWebAppHelp({ question: "Nhật ký ở đâu?" }, AUTH, { db });
    expect(r.isCrisisReply).toBe(false);
    expect(r.href).toBe("/nhat-ky");
    expect(r.answer).toMatch(/nhật ký cảm xúc/i);
  });

  it("câu ngoài phạm vi: nói rõ giới hạn, không kèm đường dẫn bịa", async () => {
    const { db } = fakeDb();
    const r = await runAskWebAppHelp({ question: "2 cộng 2 bằng mấy" }, AUTH, { db });
    expect(r.isCrisisReply).toBe(false);
    expect(r.href).toBeUndefined();
    expect(r.answer).toMatch(/chỉ giúp được về cách dùng ExamCalm/i);
  });

  it("KHÔNG ghi cảnh báo cho câu hỏi bình thường", async () => {
    const { db, added } = fakeDb();
    await runAskWebAppHelp({ question: "thư viện ở đâu" }, AUTH, { db });
    expect(added).toHaveLength(0);
  });
});

describe("runAskWebAppHelp — lớp an toàn", () => {
  // Ly do ton tai cua toan bo lop nay: hoc sinh dang buon van co the go vao
  // day. Bot tra loi "minh chi ho tro cach dung web" trong tinh huong do te
  // hon han viec khong co bot.
  it("tin nhắn có dấu hiệu khủng hoảng nhận đường an toàn, không phải câu FAQ", async () => {
    const { db } = fakeDb();
    const r = await runAskWebAppHelp({ question: "em muốn chết" }, AUTH, { db, now: () => NOW });
    expect(r.isCrisisReply).toBe(true);
    expect(r.answer).toBe(CRISIS_REPLY_TEXT);
    // Số 111 phải có mặt trong câu trả lời an toàn.
    expect(r.answer).toMatch(/111/);
  });

  it("ghi cảnh báo cho thầy cô, KHÔNG kèm nội dung tin nhắn", async () => {
    const { db, added } = fakeDb();
    await runAskWebAppHelp({ question: "em muốn chết" }, AUTH, { db, now: () => NOW });
    expect(added).toHaveLength(1);
    const alert = added[0] as Record<string, unknown>;
    expect(alert.userId).toBe("u1");
    expect(alert.triggeredBy).toBe("keyword");
    // Rào chắn quyền riêng tư: cảnh báo chỉ mang sáu field cho phép.
    expect(Object.keys(alert).sort()).toEqual(
      ["createdAt", "handledAt", "handledBy", "severity", "triggeredBy", "userId"].sort(),
    );
  });

  it("ghi cảnh báo hỏng vẫn KHÔNG chặn câu trả lời an toàn", async () => {
    const db = {
      collection: () => ({
        where: () => ({
          where: () => ({ where: () => ({ limit: () => ({ get: async () => { throw new Error("net"); } }) }) }),
        }),
        add: async () => { throw new Error("net"); },
        doc: () => ({ update: async () => undefined }),
      }),
    } as unknown as Firestore;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runAskWebAppHelp({ question: "em muốn chết" }, AUTH, { db, now: () => NOW });
    expect(r.answer).toBe(CRISIS_REPLY_TEXT);
    spy.mockRestore();
  });
});
