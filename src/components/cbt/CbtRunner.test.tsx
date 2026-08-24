import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const saveCbtSession = vi.fn(async () => {});
const saveMoodLog = vi.fn(async () => "mood-id");

vi.mock("@/lib/firestore/cbt-sessions", () => ({
  newSessionRef: () => ({ id: "sess-1", path: "cbtSessions/sess-1" }),
  saveCbtSession,
}));
vi.mock("@/lib/firestore/moods", () => ({ saveMoodLog }));

const { CbtRunner } = await import("@/components/cbt/CbtRunner");

const MODULE = {
  id: "m1", title: "Bài mẫu", version: 1, status: "published" as const,
  isSampleContent: true, disclaimer: "Không thay thế chuyên gia.",
  intro: "Giới thiệu", steps: [{ id: "s1", prompt: "Bạn đang nghĩ gì?", hint: "" }],
  closingText: "Cảm ơn bạn.", suggestedResourceSlugs: [], updatedBy: "admin",
};

beforeEach(() => { saveCbtSession.mockClear(); saveMoodLog.mockClear(); });

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
});
