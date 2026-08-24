import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodWidget } from "./MoodWidget";
import { saveMoodLog } from "@/lib/firestore/moods";
import { requestReflection, getOutputForMoodLog } from "@/lib/firestore/ai-outputs";
import { getAiOptIn } from "@/lib/firestore/ai-optin";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";

// Task 11b: MoodWidget giờ render ReflectionCard thật (không mock component
// đó) sau khi lưu — nên phải mock các module Firestore/callable ở tầng lá,
// đúng theo cách mọi test khác trong repo mock Firestore (xem ai-public.test.ts,
// AiConsentSection.test.tsx). Hai bài test gốc phía dưới dùng canSave={false}
// nên không bao giờ chạm các mock này — thêm mock ở đây không đổi hành vi của
// chúng.
vi.mock("@/lib/firestore/moods", () => ({ saveMoodLog: vi.fn() }));
vi.mock("@/lib/firestore/ai-outputs", () => ({
  requestReflection: vi.fn(),
  getOutputForMoodLog: vi.fn(),
  setOutputFeedback: vi.fn(),
  deleteOutput: vi.fn(),
}));
vi.mock("@/lib/firestore/ai-optin", () => ({ getAiOptIn: vi.fn() }));
vi.mock("@/lib/firestore/ai-public", () => ({ getAiPublicConfig: vi.fn() }));

const mockedSaveMoodLog = vi.mocked(saveMoodLog);
const mockedRequestReflection = vi.mocked(requestReflection);
const mockedGetOutputForMoodLog = vi.mocked(getOutputForMoodLog);
const mockedGetAiOptIn = vi.mocked(getAiOptIn);
const mockedGetAiPublicConfig = vi.mocked(getAiPublicConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSaveMoodLog.mockResolvedValue("mood-1");
  mockedGetAiOptIn.mockResolvedValue(false);
  mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false });
});

describe("MoodWidget", () => {
  it("học sinh đã có tài khoản nhưng CHƯA xác thực email thấy lời mời xác thực, không phải lời mời đăng ký", async () => {
    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave={false} />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));

    expect(screen.getByRole("link", { name: /xác thực email/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /đăng ký để lưu nhật ký/i })).not.toBeInTheDocument();
  });

  it("Guest (chưa đăng nhập) thấy lời mời đăng ký, không phải lời mời xác thực email", async () => {
    const user = userEvent.setup();
    render(<MoodWidget uid={null} canSave={false} />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));

    expect(screen.getByRole("link", { name: /đăng ký để lưu nhật ký/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /xác thực email/i })).not.toBeInTheDocument();
  });

  // --- Task 11b: nối ReflectionCard vào MoodWidget (task-11b-brief.md) ---

  it("aiOptIn tắt: sau khi lưu, panel hiện xác nhận nhưng KHÔNG có nội dung AI, không gọi requestReflection", async () => {
    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));
    await user.click(screen.getByRole("button", { name: /lưu vào nhật ký/i }));

    expect(await screen.findByText(/đã lưu vào nhật ký cảm xúc/i)).toBeInTheDocument();
    expect(screen.queryByText(/nội dung do ai tạo/i)).not.toBeInTheDocument();
    expect(mockedRequestReflection).not.toHaveBeenCalled();
    expect(mockedSaveMoodLog).toHaveBeenCalledWith("u1", expect.any(Object));
  });

  it("aiOptIn bật + aiPublic bật: sau khi lưu, thẻ phản chiếu xuất hiện trong panel", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true });
    mockedRequestReflection.mockResolvedValue({ outputId: "output-1" });
    mockedGetOutputForMoodLog.mockResolvedValue({
      id: "output-1",
      userId: "u1",
      moodLogId: "mood-1",
      reflectionText: "Bạn đã cố gắng rất nhiều hôm nay.",
      catStoryText: "Chú mèo lặng lẽ ngồi cạnh bạn.",
      journalPrompt: "Điều gì khiến bạn thấy nhẹ nhõm hơn?",
      promptTemplateId: "tpl-1",
      promptVersion: 1,
      providerLabel: "DeepSeek",
      model: "deepseek-chat",
      userFeedback: null,
      createdAt: null,
    });

    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));
    await user.click(screen.getByRole("button", { name: /lưu vào nhật ký/i }));

    expect(await screen.findByText("Bạn đã cố gắng rất nhiều hôm nay.")).toBeInTheDocument();
  });

  it("panel KHÔNG tự đóng khi aiOptIn bật; nút đóng tường minh hoạt động", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true });
    mockedRequestReflection.mockResolvedValue({ outputId: "output-1" });
    mockedGetOutputForMoodLog.mockResolvedValue(null);

    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));
    await user.click(screen.getByRole("button", { name: /lưu vào nhật ký/i }));

    await screen.findByText(/đã lưu vào nhật ký cảm xúc/i);
    expect(screen.getByRole("dialog", { name: /nhật ký cảm xúc/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /đóng/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Ràng buộc cứng nhất của task: ghi cảm xúc vẫn lưu được khi lớp AI hỏng
  // hoàn toàn. Test ở mức tích hợp — mount MoodWidget thật, chỉ mock các
  // module Firestore/callable ở tầng lá, không mock ReflectionCard.
  it("AI layer hỏng hoàn toàn: mood log vẫn lưu, học sinh vẫn thấy đã lưu, không có gì gợi ý mất dữ liệu", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true });
    mockedRequestReflection.mockRejectedValue(new Error("Không thể kết nối AI."));

    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));
    await user.click(screen.getByRole("button", { name: /lưu vào nhật ký/i }));

    expect(await screen.findByText(/đã lưu vào nhật ký cảm xúc/i)).toBeInTheDocument();
    expect(mockedSaveMoodLog).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/chưa lưu|không lưu được|lưu thất bại|mất dữ liệu/i),
    ).not.toBeInTheDocument();
  });
});
