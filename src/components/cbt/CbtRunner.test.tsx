import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const saveCbtSession = vi.fn(async () => {});
const saveMoodLog = vi.fn(async () => "mood-id");

// Task 11b: CbtRunner giờ render ReflectionCard thật ở phase "done" — nên
// phải mock các module Firestore/callable ở tầng lá mà ReflectionCard dùng,
// đúng cách mọi test khác trong repo mock Firestore (xem ai-public.test.ts).
// Mặc định gate đóng (aiOptIn tắt) để mọi test SẴN CÓ ở dưới giữ nguyên hành
// vi cũ — không có test nào trong số đó chạm các mock mới này.
const requestReflection = vi.fn();
const getOutputForMoodLog = vi.fn();
const getAiOptIn = vi.fn(async () => false);
const getAiPublicConfig = vi.fn(async () => ({ providerLabel: "", enabled: false }));

vi.mock("@/lib/firestore/cbt-sessions", () => ({
  newSessionRef: () => ({ id: "sess-1", path: "cbtSessions/sess-1" }),
  saveCbtSession,
}));
vi.mock("@/lib/firestore/moods", () => ({ saveMoodLog }));
vi.mock("@/lib/firestore/ai-outputs", () => ({
  requestReflection,
  getOutputForMoodLog,
  setOutputFeedback: vi.fn(),
  deleteOutput: vi.fn(),
}));
vi.mock("@/lib/firestore/ai-optin", () => ({ getAiOptIn }));
vi.mock("@/lib/firestore/ai-public", () => ({ getAiPublicConfig }));

const { CbtRunner } = await import("@/components/cbt/CbtRunner");

const MODULE = {
  id: "m1", title: "Bài mẫu", version: 1, status: "published" as const,
  isSampleContent: true, disclaimer: "Không thay thế chuyên gia.",
  intro: "Giới thiệu", steps: [{ id: "s1", prompt: "Bạn đang nghĩ gì?", hint: "" }],
  closingText: "Cảm ơn bạn.", suggestedResourceSlugs: [], updatedBy: "admin",
};

beforeEach(() => { saveCbtSession.mockClear(); saveMoodLog.mockClear(); });

// Beforeeach RIÊNG cho các mock mới của Task 11b — tách khỏi beforeEach gốc ở
// trên để không sửa một ký tự nào của nó (xem task-11b-brief.md, ràng buộc
// "mọi test có sẵn phải pass không sửa một ký tự nào").
beforeEach(() => {
  requestReflection.mockClear();
  getOutputForMoodLog.mockClear();
  getAiOptIn.mockClear();
  getAiPublicConfig.mockClear();
});

describe("CbtRunner", () => {
  it("luôn hiện disclaimer", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(screen.getByText(/không thay thế chuyên gia/i)).toBeInTheDocument();
  });

  it("hiện banner nội dung mẫu khi isSampleContent", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("Guest thấy lời mời đăng ký, không thấy nút bắt đầu", () => {
    render(<CbtRunner module={MODULE} uid={null} canSave={false} />);
    expect(screen.getByRole("link", { name: /đăng ký/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bắt đầu/i })).not.toBeInTheDocument();
  });

  it("học sinh chưa xác thực email thấy lời mời xác thực, không phải đăng ký", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave={false} />);
    expect(screen.getByRole("link", { name: /xác thực email/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^đăng ký/i })).not.toBeInTheDocument();
  });

  it("cảm xúc trước gắn linkedActivityRef trỏ vào session sắp ghi", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    // Nhãn nút gửi cảm xúc "trước" là "Lưu và bắt đầu" (truyền qua submitLabel
    // của MoodForm) — xem task-5-report.md phần A về vì sao không dùng nhãn
    // mặc định "Lưu vào nhật ký" của MoodForm ở đây.
    await user.click(screen.getByRole("button", { name: /lưu và bắt đầu/i }));

    expect(saveMoodLog).toHaveBeenCalledWith("u1", expect.objectContaining({
      context: "before",
      linkedActivityRef: "cbtSessions/sess-1",
    }));
  });

  it("bỏ qua được bước cảm xúc trước", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));

    expect(saveMoodLog).not.toHaveBeenCalled();
    expect(screen.getByText("Bạn đang nghĩ gì?")).toBeInTheDocument();
  });

  it("ghi session với id đã sinh từ đầu", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "Mình sợ trượt");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));

    expect(saveCbtSession).toHaveBeenCalledWith("u1", "sess-1", expect.objectContaining({
      moduleId: "m1", moduleVersion: 1, answers: { s1: "Mình sợ trượt" },
    }));
  });

  // Pipeline thật là before → steps → summary → after → done (xem
  // task-5-report.md phần B). "Hoàn thành" ghi phiên rồi đưa học sinh sang
  // bước cảm xúc "sau" — closingText chỉ hiện sau khi bước đó xong hoặc bị
  // bỏ qua, nên test này bỏ qua bước cảm xúc "sau" trước khi kiểm tra lời kết.
  it("ghi session hỏng vẫn hiện lời kết, không mất bài của học sinh", async () => {
    saveCbtSession.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "a");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));

    expect(await screen.findByText(/cảm ơn bạn/i)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/chờ đồng bộ/i);
  });

  // Bổ sung so với brief gốc: chứng minh trực tiếp defect vừa sửa (phase
  // "after" từng không bao giờ tới được) không tái diễn — cảm xúc "sau" vẫn
  // được ghi với đúng linkedActivityRef, kể cả khi ghi phiên làm bài thất bại
  // (xem task-5-report.md phần B/C).
  it("cảm xúc sau gắn cùng linkedActivityRef, kể cả khi ghi phiên thất bại", async () => {
    saveCbtSession.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "a");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));
    await user.click(screen.getByRole("button", { name: /lưu và xem lời kết/i }));

    expect(saveMoodLog).toHaveBeenCalledWith("u1", expect.objectContaining({
      context: "after",
      linkedActivityRef: "cbtSessions/sess-1",
    }));
  });

  // Mở rộng so với brief gốc: check gốc chỉ soi màn hình intro, nên chữ áp
  // lực thêm vào steps/summary/after/done sẽ lọt qua. Đi qua lần lượt cả 6
  // pha (kể cả nhánh bỏ qua ở before/after) và soi lại sau mỗi lần chuyển pha.
  it("không có ngôn ngữ chuỗi ngày ở bất kỳ pha nào", async () => {
    const user = userEvent.setup();
    const forbidden = /chuỗi|liên tiếp|streak|bỏ lỡ/i;
    const { container } = render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(container.textContent).not.toMatch(forbidden); // intro

    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    expect(container.textContent).not.toMatch(forbidden); // before

    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    expect(container.textContent).not.toMatch(forbidden); // steps

    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "a");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    expect(container.textContent).not.toMatch(forbidden); // summary

    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));
    expect(container.textContent).not.toMatch(forbidden); // after

    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    expect(container.textContent).not.toMatch(forbidden); // done
  });

  // --- Task 11b: nối ReflectionCard vào CbtRunner (task-11b-brief.md) ---

  // Đưa CbtRunner tới phase "done" bằng đường LƯU cảm xúc "sau" thật (không
  // phải "bỏ qua") — chỉ đường này mới có moodLogId để ReflectionCard dùng.
  async function reachDoneBySavingAfterMood(user: ReturnType<typeof userEvent.setup>) {
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "a");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));
    await user.click(screen.getByRole("button", { name: /lưu và xem lời kết/i }));
  }

  it("aiOptIn tắt: phase done không có nội dung AI, không gọi requestReflection", async () => {
    const user = userEvent.setup();
    await reachDoneBySavingAfterMood(user);

    expect(await screen.findByText(/cảm ơn bạn/i)).toBeInTheDocument();
    expect(screen.queryByText(/nội dung do ai tạo/i)).not.toBeInTheDocument();
    expect(requestReflection).not.toHaveBeenCalled();
  });

  it("aiOptIn bật + aiPublic bật: phase done hiện thẻ phản chiếu dùng moodLogId của cảm xúc sau", async () => {
    getAiOptIn.mockResolvedValueOnce(true);
    getAiPublicConfig.mockResolvedValueOnce({ providerLabel: "DeepSeek", enabled: true });
    requestReflection.mockResolvedValueOnce({ outputId: "output-1" });
    getOutputForMoodLog.mockResolvedValueOnce({
      id: "output-1",
      userId: "u1",
      moodLogId: "mood-id",
      reflectionText: "Bạn đã hoàn thành bài tập rất tốt.",
      catStoryText: "Chú mèo mỉm cười.",
      journalPrompt: "Bạn muốn ghi nhớ điều gì từ hôm nay?",
      promptTemplateId: "tpl-1",
      promptVersion: 1,
      providerLabel: "DeepSeek",
      model: "deepseek-chat",
      userFeedback: null,
      createdAt: null,
    });

    const user = userEvent.setup();
    await reachDoneBySavingAfterMood(user);

    expect(await screen.findByText("Bạn đã hoàn thành bài tập rất tốt.")).toBeInTheDocument();
    expect(requestReflection).toHaveBeenCalledWith("mood-id");
  });

  // Ràng buộc cứng nhất của task: bài làm và cảm xúc vẫn lưu được khi lớp AI
  // hỏng hoàn toàn. Test ở mức tích hợp — mount CbtRunner thật, chỉ mock các
  // module Firestore/callable ở tầng lá, không mock ReflectionCard.
  it("AI layer hỏng hoàn toàn: vẫn hiện lời kết, không có gì gợi ý mất bài hay mất cảm xúc", async () => {
    getAiOptIn.mockResolvedValueOnce(true);
    getAiPublicConfig.mockResolvedValueOnce({ providerLabel: "DeepSeek", enabled: true });
    requestReflection.mockRejectedValueOnce(new Error("Không thể kết nối AI."));

    const user = userEvent.setup();
    await reachDoneBySavingAfterMood(user);

    expect(await screen.findByText(/cảm ơn bạn/i)).toBeInTheDocument();
    expect(saveMoodLog).toHaveBeenCalledWith("u1", expect.objectContaining({ context: "after" }));
    expect(
      screen.queryByText(/chưa lưu|không lưu được|lưu thất bại|mất dữ liệu|mất bài/i),
    ).not.toBeInTheDocument();
  });
});
