import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWindow } from "./ChatWindow";
import {
  startChatSession,
  sendMessage,
  listMessages,
  listMySessions,
  deleteMessage,
  deleteSession,
  ChatSendError,
  type ChatMessageRecord,
  type ChatSessionRecord,
} from "@/lib/firestore/chat";
import { getAiOptIn } from "@/lib/firestore/ai-optin";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";

vi.mock("@/lib/firestore/chat", () => {
  // Fix round 1 (Finding 2, coordinator): ChatSendError phải là class THẬT (không phải
  // vi.fn()) để ChatWindow.tsx `err instanceof ChatSendError` nhận đúng trong test — cùng lý
  // do MockTimestamp ở chat.test.ts phải là class thật, không phải mock rỗng. Định nghĩa cục
  // bộ trong factory (thay vì vi.importActual chat.ts thật) để không kéo theo firebase/* thật.
  class ChatSendError extends Error {
    kind: "quota" | "rate_limit" | "error";
    constructor(message: string, kind: "quota" | "rate_limit" | "error") {
      super(message);
      this.kind = kind;
    }
  }
  return {
    startChatSession: vi.fn(),
    sendMessage: vi.fn(),
    listMessages: vi.fn(),
    listMySessions: vi.fn(),
    deleteMessage: vi.fn(),
    deleteSession: vi.fn(),
    ChatSendError,
  };
});

// Cùng khuôn ReflectionCard.test.tsx (Task 11b): ChatWindow tự đọc cổng của
// chính nó thay vì nhận prop, nên phải mock hai nguồn đọc gate này.
vi.mock("@/lib/firestore/ai-optin", () => ({
  getAiOptIn: vi.fn(),
}));
vi.mock("@/lib/firestore/ai-public", () => ({
  getAiPublicConfig: vi.fn(),
}));

const mockedStartChatSession = vi.mocked(startChatSession);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedListMessages = vi.mocked(listMessages);
const mockedListMySessions = vi.mocked(listMySessions);
const mockedDeleteMessage = vi.mocked(deleteMessage);
const mockedDeleteSession = vi.mocked(deleteSession);
const mockedGetAiOptIn = vi.mocked(getAiOptIn);
const mockedGetAiPublicConfig = vi.mocked(getAiPublicConfig);

// Câu chữ lấy NGUYÊN VĂN từ chat.ts (Task 6) — brief yêu cầu ChatWindow chỉ
// hiển thị đúng err.message, không tự viết lại.
const QUOTA_MESSAGE = "Bạn đã dùng hết lượt trò chuyện AI hôm nay rồi, mai quay lại nhé.";
const SEND_ERROR_MESSAGE = "Không thể gửi tin nhắn lúc này, thử lại sau nhé.";
const SAFETY_SENTENCE =
  "Nếu em nói điều gì khiến chúng tôi lo cho sự an toàn của em, thầy cô sẽ được báo để giúp em.";

function makeMessage(overrides: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: "m1",
    userId: "u1",
    sessionId: "s1",
    role: "user",
    text: "Xin chào",
    isCrisisResponse: false,
    createdAt: null,
    ...overrides,
  };
}

const EXISTING_SESSION: ChatSessionRecord = {
  id: "s1",
  userId: "u1",
  startedAt: null,
  lastMessageAt: null,
  messageCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAiOptIn.mockResolvedValue(true);
  mockedGetAiPublicConfig.mockResolvedValue({
    providerLabel: "DeepSeek", enabled: true, reflectionEnabled: false, chatEnabled: true,
  });
  // Mặc định: chưa có phiên nào — ChatWindow chỉ tạo phiên mới lúc gửi tin đầu tiên.
  mockedListMySessions.mockResolvedValue([]);
  mockedListMessages.mockResolvedValue([]);
  mockedStartChatSession.mockResolvedValue("s1");
  mockedSendMessage.mockResolvedValue({ messageId: "assistant-1" });
  mockedDeleteMessage.mockResolvedValue(undefined);
  mockedDeleteSession.mockResolvedValue(undefined);
});

describe("ChatWindow", () => {
  it("aiOptIn tắt (gate đóng): không render ô chat, chỉ dẫn tới trang Hồ sơ, không gọi hàm chat nào", async () => {
    mockedGetAiOptIn.mockResolvedValue(false);
    render(<ChatWindow uid="u1" />);

    const link = await screen.findByRole("link", { name: /hồ sơ/i });
    expect(link).toHaveAttribute("href", "/ho-so");
    expect(screen.queryByLabelText(/nhập tin nhắn/i)).not.toBeInTheDocument();
    expect(mockedListMySessions).not.toHaveBeenCalled();
    expect(mockedStartChatSession).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("aiPublic tắt dù aiOptIn bật (gate đóng): không render ô chat, không gọi hàm chat nào", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({
      providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
    });
    render(<ChatWindow uid="u1" />);

    await screen.findByRole("link", { name: /hồ sơ/i });
    expect(screen.queryByLabelText(/nhập tin nhắn/i)).not.toBeInTheDocument();
    expect(mockedListMySessions).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  // Task 9 fix round 1, Finding 2 (CRITICAL — reviewer): gate PHẢI khoá theo chatEnabled, KHÔNG
  // PHẢI enabled — đối xứng ReflectionCard.tsx: bật RIÊNG phản chiếu (chat vẫn tắt) không được
  // phép mở ô nhập chat.
  it("Finding 2: enabled=true nhưng chatEnabled=false (chỉ phản chiếu bật) -> gate vẫn ĐÓNG", async () => {
    mockedGetAiOptIn.mockResolvedValue(true);
    mockedGetAiPublicConfig.mockResolvedValue({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: true, chatEnabled: false,
    });
    render(<ChatWindow uid="u1" />);

    await screen.findByRole("link", { name: /hồ sơ/i });
    expect(screen.queryByLabelText(/nhập tin nhắn/i)).not.toBeInTheDocument();
    expect(mockedListMySessions).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("trước tin nhắn đầu tiên: hiện câu cảnh báo an toàn, là text thật (không phải tooltip)", async () => {
    render(<ChatWindow uid="u1" />);

    await screen.findByLabelText(/nhập tin nhắn/i);
    const sentence = screen.getByText(SAFETY_SENTENCE);
    expect(sentence).toBeVisible();
    expect(sentence.tagName).not.toBe("TITLE");
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("trước tin nhắn đầu tiên: hiện nhãn 'Nội dung do AI tạo'", async () => {
    render(<ChatWindow uid="u1" />);

    await screen.findByLabelText(/nhập tin nhắn/i);
    const label = screen.getByText("Nội dung do AI tạo");
    expect(label).toBeVisible();
  });

  it("gửi tin: hiện tin của mình ngay, trạng thái đang chờ, rồi tin trả lời", async () => {
    let resolveSend: (v: { messageId: string }) => void = () => {};
    mockedSendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    mockedListMessages.mockResolvedValue([
      makeMessage({ id: "m1", role: "user", text: "Em rất mệt" }),
      makeMessage({ id: "m2", role: "assistant", text: "Mình ở đây với bạn." }),
    ]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    await user.type(input, "Em rất mệt");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));

    // Tin của mình hiện ngay, ô nhập được xoá, trạng thái đang chờ hiện ra —
    // TRƯỚC KHI sendMessage resolve.
    expect(screen.getByText("Em rất mệt")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByText(/đang trả lời/i)).toBeInTheDocument();
    expect(mockedStartChatSession).toHaveBeenCalledWith("u1");
    expect(mockedSendMessage).toHaveBeenCalledWith("s1", "Em rất mệt");

    resolveSend({ messageId: "m2" });

    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledWith("u1", "s1"));
    expect(await screen.findByText("Mình ở đây với bạn.")).toBeInTheDocument();
    expect(screen.queryByText(/đang trả lời/i)).not.toBeInTheDocument();
  });

  it("gửi lỗi thật: hiện thông báo dạng role=alert, nội dung đã gõ không mất — quay lại ô nhập", async () => {
    mockedSendMessage.mockRejectedValue(new ChatSendError(SEND_ERROR_MESSAGE, "error"));
    // Phiên đã có sẵn (không phải lần gửi đầu) — cô lập test này khỏi hành vi dọn rác orphan
    // của Finding 1, có test riêng bên dưới.
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    await user.type(input, "Em không biết phải làm sao");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SEND_ERROR_MESSAGE);
    expect(input).toHaveValue("Em không biết phải làm sao");
  });

  // Fix round 1 (Finding 2, coordinator): hết quota/rate limit KHÔNG phải lỗi — không được
  // hiện qua role="alert" đỏ khẩn cấp như lỗi gửi thật, phải qua role="status" trung tính
  // (cùng khuôn ReflectionCard.tsx). Phân biệt bằng `kind` máy đọc được từ ChatSendError,
  // KHÔNG suy luận lại từ câu chữ tiếng Việt.
  it("hết quota: thông điệp riêng, tử tế, không dùng từ 'lỗi', hiện qua role=status (không phải alert)", async () => {
    mockedSendMessage.mockRejectedValue(new ChatSendError(QUOTA_MESSAGE, "quota"));
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    await user.type(input, "Cho em hỏi thêm");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(QUOTA_MESSAGE);
    expect(status.textContent).not.toMatch(/lỗi/i);
    expect(input).toHaveValue("Cho em hỏi thêm");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Fix round 1 (Finding 1, coordinator): gửi tin ĐẦU TIÊN thất bại tạo ra một phiên rỗng
  // (startChatSession chạy trước sendMessage) — nếu học sinh không gửi lại trong tab đó, phiên
  // này kẹt vĩnh viễn không ai xoá được. ChatWindow phải tự dọn: kiểm tra phiên vừa tạo có tin
  // nào không (listMessages), rỗng thì xoá luôn và đặt lại sessionId=null.
  it("gửi tin đầu tiên thất bại: tự xoá phiên rỗng vừa tạo, không để lại orphan, gửi lại tạo phiên mới sạch", async () => {
    mockedStartChatSession.mockResolvedValueOnce("s-new").mockResolvedValueOnce("s-retry");
    mockedSendMessage.mockRejectedValue(new ChatSendError(SEND_ERROR_MESSAGE, "error"));
    // listMessages dùng cho bước dọn rác: phiên vừa tạo không có tin nào.
    mockedListMessages.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    await user.type(input, "Tin đầu tiên");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));

    await screen.findByRole("alert");
    await waitFor(() => expect(mockedDeleteSession).toHaveBeenCalledWith("u1", "s-new"));

    // Phiên đã bị xoá và không còn tin nào — không có gì để hiện nút xoá cả hội thoại.
    expect(screen.queryByRole("button", { name: /xoá cả hội thoại/i })).not.toBeInTheDocument();

    // Gửi lại: phải tạo phiên MỚI ("s-retry"), không tái dùng "s-new" đã bị xoá.
    await user.clear(input);
    await user.type(input, "Tin thử lại");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));
    await waitFor(() => expect(mockedStartChatSession).toHaveBeenCalledTimes(2));
    expect(mockedSendMessage).toHaveBeenCalledWith("s-retry", "Tin thử lại");
  });

  // Fix round 1 (Finding 1, coordinator): nút "Xoá cả hội thoại" không còn phụ thuộc
  // messages.length > 0 — một phiên đã tồn tại nhưng chưa có tin nào (dọn rác tự động thất
  // bại, hoặc bất kỳ lý do nào khác) vẫn phải xoá được, không phải kẹt vì "chưa có gì để xoá".
  it("phiên đã tồn tại nhưng chưa có tin nào: nút Xoá cả hội thoại vẫn hiện", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([]);

    render(<ChatWindow uid="u1" />);

    await screen.findByLabelText(/nhập tin nhắn/i);
    expect(screen.getByRole("button", { name: /xoá cả hội thoại/i })).toBeInTheDocument();
  });

  it("phản hồi khủng hoảng: hiển thị nổi bật, có tel:111 bấm gọi được, khác tin thường", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([
      makeMessage({ id: "m1", role: "user", text: "Em thấy áp lực quá", isCrisisResponse: false }),
      makeMessage({ id: "m2", role: "assistant", text: "Mình hiểu bạn đang mệt.", isCrisisResponse: false }),
      makeMessage({ id: "m3", role: "assistant", text: "Em hãy gọi ngay Tổng đài 111.", isCrisisResponse: true }),
    ]);

    render(<ChatWindow uid="u1" />);

    await screen.findByText("Em hãy gọi ngay Tổng đài 111.");

    // Chỉ ĐÚNG MỘT liên kết gọi điện trong toàn bộ danh sách tin — không dính
    // vào tin nhắn thường.
    const callLinks = screen.getAllByRole("link", { name: /111/ });
    expect(callLinks).toHaveLength(1);
    expect(callLinks[0]).toHaveAttribute("href", "tel:111");

    // Tin khủng hoảng có một dấu hiệu riêng để phân biệt khỏi tin thường.
    expect(screen.getByText(/cần trợ giúp ngay/i)).toBeInTheDocument();
  });

  // I7 (final whole-branch review): khi server phanh việc GHI (gọi lặp quá nhanh trên nhánh
  // khủng hoảng — xem sendChatMessage.ts), `sendMessage` trả về `messageId: ""` kèm
  // `crisisReplyText` thay vì id thật. ChatWindow phải hiện thẳng câu trả lời đó, KHÔNG gọi
  // listMessages() (đọc lại sẽ không thấy gì mới vì cố ý không ghi).
  it("I7: server phanh việc ghi (crisisReplyText kèm theo) → hiện thẳng câu trả lời khủng hoảng, KHÔNG gọi listMessages", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([]);
    mockedSendMessage.mockResolvedValue({
      messageId: "",
      crisisReplyText: "Em hãy gọi ngay Tổng đài 111.",
    });

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    await user.type(input, "Em muốn tự tử");
    await user.click(screen.getByRole("button", { name: /^gửi$/i }));

    expect(await screen.findByText("Em muốn tự tử")).toBeInTheDocument();
    expect(await screen.findByText("Em hãy gọi ngay Tổng đài 111.")).toBeInTheDocument();
    expect(screen.getByText(/cần trợ giúp ngay/i)).toBeInTheDocument();

    // listMessages chỉ được gọi ở bước tải phiên ban đầu (init effect) — KHÔNG lần nào nữa sau
    // khi gửi, vì server cố ý không ghi gì để đọc lại.
    expect(mockedListMessages).toHaveBeenCalledTimes(1);
  });

  it("xoá một tin nhắn: hỏi xác nhận trước, huỷ thì không xoá", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([makeMessage({ id: "m1", text: "Tin cần xoá" })]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    await screen.findByText("Tin cần xoá");
    await user.click(screen.getByRole("button", { name: /xoá tin này/i }));
    expect(mockedDeleteMessage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^huỷ$/i }));
    expect(mockedDeleteMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Tin cần xoá")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /xoá tin này/i })).toBeInTheDocument();
  });

  it("xoá một tin nhắn: xác nhận thì gọi deleteMessage và gỡ khỏi danh sách", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([makeMessage({ id: "m1", text: "Tin cần xoá" })]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    await screen.findByText("Tin cần xoá");
    await user.click(screen.getByRole("button", { name: /xoá tin này/i }));
    await user.click(screen.getByRole("button", { name: /xác nhận xoá/i }));

    expect(mockedDeleteMessage).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(screen.queryByText("Tin cần xoá")).not.toBeInTheDocument());
  });

  it("xoá cả hội thoại: hỏi xác nhận, xác nhận thì gọi deleteSession và xoá sạch danh sách", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([makeMessage({ id: "m1", text: "Tin trong hội thoại" })]);

    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    await screen.findByText("Tin trong hội thoại");
    await user.click(screen.getByRole("button", { name: /xoá cả hội thoại/i }));
    expect(mockedDeleteSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /xác nhận xoá/i }));

    expect(mockedDeleteSession).toHaveBeenCalledWith("u1", "s1");
    await waitFor(() => expect(screen.queryByText("Tin trong hội thoại")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /xoá cả hội thoại/i })).not.toBeInTheDocument();
  });

  it("mở lại trang khi đã có phiên trước đó: tải lại tin nhắn cũ, không tạo phiên mới", async () => {
    mockedListMySessions.mockResolvedValue([EXISTING_SESSION]);
    mockedListMessages.mockResolvedValue([makeMessage({ id: "m1", text: "Tin từ hôm qua" })]);

    render(<ChatWindow uid="u1" />);

    expect(await screen.findByText("Tin từ hôm qua")).toBeInTheDocument();
    expect(mockedListMessages).toHaveBeenCalledWith("u1", "s1");
    expect(mockedStartChatSession).not.toHaveBeenCalled();
  });

  it("bàn phím: ô nhập có nhãn, Enter gửi tin, vùng tin nhắn là live region", async () => {
    const user = userEvent.setup();
    render(<ChatWindow uid="u1" />);

    const input = await screen.findByLabelText(/nhập tin nhắn/i);
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");

    await user.type(input, "Chào mèo{Enter}");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("s1", "Chào mèo"));
  });
});
