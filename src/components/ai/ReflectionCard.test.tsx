import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReflectionCard } from "./ReflectionCard";
import {
  requestReflection,
  getOutputForMoodLog,
  setOutputFeedback,
  deleteOutput,
  type AiJournalOutputRecord,
} from "@/lib/firestore/ai-outputs";
import { getAiOptIn } from "@/lib/firestore/ai-optin";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";

vi.mock("@/lib/firestore/ai-outputs", () => ({
  requestReflection: vi.fn(),
  getOutputForMoodLog: vi.fn(),
  setOutputFeedback: vi.fn(),
  deleteOutput: vi.fn(),
}));

// Task 11b, Quyết định 1: ReflectionCard tự đọc cổng của chính nó thay vì
// nhận prop `aiOptIn` — nên giờ nó phải mock thêm hai nguồn đọc gate này.
vi.mock("@/lib/firestore/ai-optin", () => ({
  getAiOptIn: vi.fn(),
}));
vi.mock("@/lib/firestore/ai-public", () => ({
  getAiPublicConfig: vi.fn(),
}));

const mockedRequestReflection = vi.mocked(requestReflection);
const mockedGetOutputForMoodLog = vi.mocked(getOutputForMoodLog);
const mockedSetOutputFeedback = vi.mocked(setOutputFeedback);
const mockedDeleteOutput = vi.mocked(deleteOutput);
const mockedGetAiOptIn = vi.mocked(getAiOptIn);
const mockedGetAiPublicConfig = vi.mocked(getAiPublicConfig);

// Bản ghi mẫu — khớp AiJournalOutputRecord của Task 9.
const RECORD: AiJournalOutputRecord = {
  id: "output-1",
  userId: "u1",
  moodLogId: "m1",
  reflectionText: "Bạn đã cố gắng rất nhiều hôm nay.",
  catStoryText: "Chú mèo cuộn tròn cạnh bạn, lặng lẽ lắng nghe.",
  journalPrompt: "Điều gì khiến bạn thấy nhẹ nhõm hơn một chút?",
  promptTemplateId: "tpl-1",
  promptVersion: 1,
  providerLabel: "DeepSeek",
  model: "deepseek-chat",
  userFeedback: null,
  createdAt: null,
};

// Hai thông điệp lỗi này lấy NGUYÊN VĂN từ mapping thật của Task 9
// (src/lib/firestore/ai-outputs.ts, mapReflectionErrorMessage) — brief yêu
// cầu không viết lại câu chữ, chỉ hiển thị đúng những gì requestReflection
// đã ném ra.
const INTERNAL_ERROR_MESSAGE =
  "Không thể tạo phản chiếu lúc này, nhưng nhật ký cảm xúc của bạn đã được lưu an toàn. Thử lại sau nhé.";
const QUOTA_MESSAGE = "Bạn đã dùng hết lượt phản chiếu AI cho hôm nay rồi, mai quay lại nhé.";

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequestReflection.mockResolvedValue({ outputId: "output-1" });
  mockedGetOutputForMoodLog.mockResolvedValue(RECORD);
  mockedSetOutputFeedback.mockResolvedValue(undefined);
  mockedDeleteOutput.mockResolvedValue(undefined);
  // Mặc định gate MỞ (aiOptIn bật + aiPublic bật) — các test muốn gate đóng
  // tự override lại trong từng test.
  mockedGetAiOptIn.mockResolvedValue(true);
  mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true });
});

describe("ReflectionCard", () => {
  it("aiOptIn tắt (gate đóng): không render gì, không gọi requestReflection", async () => {
    mockedGetAiOptIn.mockResolvedValue(false);
    const { container } = render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await waitFor(() => expect(mockedGetAiOptIn).toHaveBeenCalledWith("u1"));
    expect(container).toBeEmptyDOMElement();
    expect(mockedRequestReflection).not.toHaveBeenCalled();
  });

  it("aiPublic tắt dù aiOptIn bật (gate đóng): không render gì, không gọi requestReflection", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false });
    const { container } = render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await waitFor(() => expect(mockedGetAiPublicConfig).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(mockedRequestReflection).not.toHaveBeenCalled();
  });

  // Fix round 1, Finding 6: đọc aiOptIn TRƯỚC, chỉ đọc systemConfig/aiPublic
  // (document nóng dùng chung toàn trường, trả phí Blaze) khi aiOptIn đã bật.
  // Học sinh chưa bật AI — đa số ở thời điểm ra mắt — không được tốn lượt đọc
  // thứ hai này mỗi lần lưu cảm xúc.
  it("aiOptIn tắt: KHÔNG đọc systemConfig/aiPublic (đọc tuần tự, không đọc song song)", async () => {
    mockedGetAiOptIn.mockResolvedValue(false);
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await waitFor(() => expect(mockedGetAiOptIn).toHaveBeenCalledWith("u1"));
    expect(mockedGetAiPublicConfig).not.toHaveBeenCalled();
  });

  // Fix round 1, Finding 4: nếu một trong hai hàm đọc gate NGOÀI DỰ KIẾN
  // reject (thực tế cả hai đều tự nuốt lỗi và không bao giờ reject — đây là
  // hàng phòng thủ cho tương lai), fail-closed phải TƯỜNG MINH: gate chuyển
  // "closed" (không kẹt mãi ở "checking"), không có unhandled rejection.
  it("getAiOptIn reject bất ngờ: fail-closed tường minh, không render gì, không gọi requestReflection", async () => {
    mockedGetAiOptIn.mockRejectedValue(new Error("mất mạng"));
    const { container } = render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mockedRequestReflection).not.toHaveBeenCalled();
  });

  // Fix round 1, Finding 2: MoodWidget đưa focus vào nút "Đóng" ngay khi lưu
  // xong, TRƯỚC KHI ReflectionCard tải xong nội dung — nên section này phải
  // là live region để trình đọc màn hình tự loan báo khi nội dung tới, dù
  // focus đang ở nơi khác.
  it("section phản chiếu có aria-live=polite để trình đọc màn hình loan báo khi nội dung tới", async () => {
    render(<ReflectionCard moodLogId="m1" uid="u1" />);
    const region = await screen.findByRole("region", { name: /phản chiếu từ mèo/i });
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("gate mở: gọi requestReflection và hiện trạng thái đang tải", async () => {
    // Giữ promise treo lơ lửng để bắt được đúng trạng thái loading.
    let resolvePending: (v: { outputId: string }) => void = () => {};
    mockedRequestReflection.mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );

    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await waitFor(() => expect(mockedRequestReflection).toHaveBeenCalledWith("m1"));
    expect(screen.getByText(/đang tạo phản chiếu/i)).toBeInTheDocument();

    resolvePending({ outputId: "output-1" });
  });

  it("thành công: hiện reflectionText, catStoryText, journalPrompt", async () => {
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    expect(await screen.findByText(RECORD.reflectionText)).toBeInTheDocument();
    expect(screen.getByText(RECORD.catStoryText)).toBeInTheDocument();
    expect(screen.getByText(RECORD.journalPrompt)).toBeInTheDocument();
    expect(mockedGetOutputForMoodLog).toHaveBeenCalledWith("u1", "m1");
  });

  it("luôn hiện nhãn 'Nội dung do AI tạo', nhìn thấy được (không phải tooltip ẩn)", async () => {
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    const label = await screen.findByText("Nội dung do AI tạo");
    expect(label).toBeVisible();
    // Nhãn phải là nội dung văn bản thật trong DOM, không phải giấu trong
    // thuộc tính title/aria-describedby của một icon.
    expect(label.tagName).not.toBe("TITLE");
  });

  it("callable lỗi: hiện thông báo nhẹ nhàng, không có chữ nào gợi ý nhật ký chưa lưu", async () => {
    mockedRequestReflection.mockRejectedValue(new Error(INTERNAL_ERROR_MESSAGE));

    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    expect(await screen.findByText(INTERNAL_ERROR_MESSAGE)).toBeInTheDocument();
    // Ràng buộc cốt lõi: AI hỏng không được đọc như nhật ký cảm xúc thất bại.
    expect(
      screen.queryByText(/chưa lưu|không lưu được|lưu thất bại|mất dữ liệu/i),
    ).not.toBeInTheDocument();
  });

  it("hết quota: thông điệp riêng, tử tế, không dùng từ 'lỗi'", async () => {
    mockedRequestReflection.mockRejectedValue(new Error(QUOTA_MESSAGE));

    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    const message = await screen.findByText(QUOTA_MESSAGE);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/lỗi/i);
  });

  it("bấm 'Hữu ích': gọi setOutputFeedback('helpful')", async () => {
    const user = userEvent.setup();
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await screen.findByText(RECORD.reflectionText);
    // Regex neo hai đầu — "Không hữu ích" cũng chứa "hữu ích" nên nếu không
    // neo sẽ khớp nhầm cả hai nút.
    await user.click(screen.getByRole("button", { name: /^hữu ích$/i }));

    expect(mockedSetOutputFeedback).toHaveBeenCalledWith("output-1", "helpful");
  });

  it("bấm 'Không hữu ích': gọi setOutputFeedback('not_helpful')", async () => {
    const user = userEvent.setup();
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await screen.findByText(RECORD.reflectionText);
    await user.click(screen.getByRole("button", { name: /không hữu ích/i }));

    expect(mockedSetOutputFeedback).toHaveBeenCalledWith("output-1", "not_helpful");
  });

  it("xoá: bấm nút xoá phải hỏi xác nhận TRƯỚC, chưa gọi deleteOutput ngay", async () => {
    const user = userEvent.setup();
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await screen.findByText(RECORD.reflectionText);
    await user.click(screen.getByRole("button", { name: /xoá phản chiếu này/i }));

    expect(mockedDeleteOutput).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /xác nhận xoá/i }));
    expect(mockedDeleteOutput).toHaveBeenCalledWith("output-1");
  });

  it("xoá: bấm huỷ ở bước xác nhận thì KHÔNG gọi deleteOutput", async () => {
    const user = userEvent.setup();
    render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await screen.findByText(RECORD.reflectionText);
    await user.click(screen.getByRole("button", { name: /xoá phản chiếu này/i }));
    await user.click(screen.getByRole("button", { name: /huỷ/i }));

    expect(mockedDeleteOutput).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /xoá phản chiếu này/i })).toBeInTheDocument();
  });

  // Fix round 1: effect chỉ reset phase/errorMessage khi moodLogId đổi, không
  // reset record/deleted/confirmingDelete — nên nếu cùng một instance nhận
  // moodLogId MỚI sau khi đã xoá phản chiếu cũ, "Đã xoá phản chiếu này." vẫn
  // còn đè lên phản chiếu mới vừa tải xong. Test này rerender cùng instance
  // với moodLogId khác sau một lần xoá và khẳng định không còn dấu vết cũ.
  it("nhận moodLogId mới sau khi đã xoá phản chiếu cũ: hiện phản chiếu mới, không còn hiện 'đã xoá'", async () => {
    const RECORD_2: AiJournalOutputRecord = {
      ...RECORD,
      id: "output-2",
      moodLogId: "m2",
      reflectionText: "Một ngày mới, một phản chiếu mới.",
    };
    mockedRequestReflection.mockImplementation(async (moodLogId: string) => ({
      outputId: moodLogId === "m2" ? "output-2" : "output-1",
    }));
    mockedGetOutputForMoodLog.mockImplementation(async (_uid: string, moodLogId: string) =>
      moodLogId === "m2" ? RECORD_2 : RECORD,
    );

    const user = userEvent.setup();
    const { rerender } = render(<ReflectionCard moodLogId="m1" uid="u1" />);

    await screen.findByText(RECORD.reflectionText);
    await user.click(screen.getByRole("button", { name: /xoá phản chiếu này/i }));
    await user.click(screen.getByRole("button", { name: /xác nhận xoá/i }));
    expect(await screen.findByText(/đã xoá phản chiếu này/i)).toBeInTheDocument();

    rerender(<ReflectionCard moodLogId="m2" uid="u1" />);

    expect(await screen.findByText(RECORD_2.reflectionText)).toBeInTheDocument();
    expect(screen.queryByText(/đã xoá phản chiếu này/i)).not.toBeInTheDocument();
  });
});
