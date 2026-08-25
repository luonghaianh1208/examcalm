import { describe, it, expect } from "vitest";
import { isAiEnabled } from "./config";

/**
 * Task 9 (task-9-brief.md): trước fix, isAiEnabled() chỉ xét killSwitch.moodReflection —
 * không nói gì về chat, dù giờ đã có HAI tính năng dùng chung một document cấu hình. Quyết
 * định (giải thích đầy đủ trong task-9-report.md): `enabled` = true khi VÀ CHỈ KHI ÍT NHẤT MỘT
 * trong hai tính năng (phản chiếu HOẶC chat) sẵn sàng phục vụ — không phải CẢ HAI.
 *
 * Lý do chọn OR chứ không phải AND: `aiPublic.enabled` là công tắc DUY NHẤT quyết định màn
 * hình đồng ý của học sinh (AiConsentSection.tsx) có hiện ô tick "aiOptIn" hay không — và
 * CHÍNH ô tick `aiOptIn` đó (một field DUY NHẤT trên users/{uid}) gate quyền truy cập CẢ HAI
 * tính năng (generateReflection.ts VÀ sendChatMessage.ts đều đọc privacySettings.aiOptIn).
 * Nếu dùng AND, một admin bật RIÊNG chat (killSwitch.chat=false, chatQuotaPerDay>0) trong khi
 * cố ý giữ phản chiếu tắt (đúng kịch bản §10 design spec: chờ chuyên gia tâm lý duyệt persona
 * VÀ CRISIS_REPLY_TEXT trước khi bật phản chiếu tiếp) sẽ khiến `enabled=false` mãi mãi —
 * checkbox aiOptIn không bao giờ hiện ra, nên KHÔNG học sinh nào bật được, KỂ CẢ chat — dù admin
 * đã cấu hình xong và bật đúng công tắc chat.
 */
describe("isAiEnabled — Task 9, quyết định OR giữa hai tính năng", () => {
  const READY_MOOD_ONLY = {
    baseUrl: "https://a.test",
    model: "m",
    killSwitch: { moodReflection: false, chat: true },
    quotaStudentPerDay: 5,
    chatQuotaPerDay: 0,
  };

  const READY_CHAT_ONLY = {
    baseUrl: "https://a.test",
    model: "m",
    killSwitch: { moodReflection: true, chat: false },
    quotaStudentPerDay: 0,
    chatQuotaPerDay: 30,
  };

  it("baseUrl rỗng -> false dù cả hai tính năng đều bật", () => {
    expect(
      isAiEnabled({
        baseUrl: "",
        model: "m",
        killSwitch: { moodReflection: false, chat: false },
        quotaStudentPerDay: 5,
        chatQuotaPerDay: 30,
      }),
    ).toBe(false);
  });

  it("model rỗng -> false dù cả hai tính năng đều bật", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test",
        model: "",
        killSwitch: { moodReflection: false, chat: false },
        quotaStudentPerDay: 5,
        chatQuotaPerDay: 30,
      }),
    ).toBe(false);
  });

  it("chỉ phản chiếu sẵn sàng, chat tắt -> true (hành vi cũ, không đổi)", () => {
    expect(isAiEnabled(READY_MOOD_ONLY)).toBe(true);
  });

  it("QUYẾT ĐỊNH MỚI: chỉ chat sẵn sàng, phản chiếu tắt -> true", () => {
    expect(isAiEnabled(READY_CHAT_ONLY)).toBe(true);
  });

  it("cả hai tính năng đều tắt (killSwitch bật cả hai) -> false", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test",
        model: "m",
        killSwitch: { moodReflection: true, chat: true },
        quotaStudentPerDay: 5,
        chatQuotaPerDay: 30,
      }),
    ).toBe(false);
  });

  it("cả hai tính năng đều sẵn sàng -> true", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test",
        model: "m",
        killSwitch: { moodReflection: false, chat: false },
        quotaStudentPerDay: 5,
        chatQuotaPerDay: 30,
      }),
    ).toBe(true);
  });

  it("chat killSwitch tắt (đang bật) nhưng chatQuotaPerDay=0 -> chat KHÔNG sẵn sàng; phản chiếu cũng tắt -> false", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test",
        model: "m",
        killSwitch: { moodReflection: true, chat: false },
        quotaStudentPerDay: 0,
        chatQuotaPerDay: 0,
      }),
    ).toBe(false);
  });

  it("phản chiếu killSwitch tắt (đang bật) nhưng quotaStudentPerDay=0 -> phản chiếu KHÔNG sẵn sàng; chat cũng tắt -> false", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test",
        model: "m",
        killSwitch: { moodReflection: false, chat: true },
        quotaStudentPerDay: 0,
        chatQuotaPerDay: 30,
      }),
    ).toBe(false);
  });
});
