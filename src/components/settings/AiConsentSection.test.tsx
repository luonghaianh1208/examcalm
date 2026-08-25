import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiConsentSection } from "./AiConsentSection";
import { updateDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";
import { deleteAllMyOutputs } from "@/lib/firestore/ai-outputs";
import { CURRENT_AI_CONSENT_VERSION } from "@/lib/types/ai-consent";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firestore/ai-public", () => ({
  getAiPublicConfig: vi.fn(),
}));

vi.mock("@/lib/firestore/ai-outputs", () => ({
  deleteAllMyOutputs: vi.fn().mockResolvedValue(0),
}));

const mockedUpdateDoc = vi.mocked(updateDoc);
const mockedGetAiPublicConfig = vi.mocked(getAiPublicConfig);
const mockedDeleteAllMyOutputs = vi.mocked(deleteAllMyOutputs);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdateDoc.mockResolvedValue(undefined);
  mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true, reflectionEnabled: true, chatEnabled: false });
  mockedDeleteAllMyOutputs.mockResolvedValue(0);
});

describe("AiConsentSection", () => {
  it("mặc định hiển thị trạng thái tắt", async () => {
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });

  it("trước khi bật: hộp thoại nêu đích danh providerLabel đọc từ aiPublic (không phải chuỗi cứng)", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/DeepSeek/)).toBeInTheDocument();
  });

  it("hộp thoại nói rõ ghi chú gửi tới dịch vụ bên ngoài và có thể tắt bất cứ lúc nào", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/(gửi|dịch vụ).*(bên ngoài)/i);
    expect(dialog).toHaveTextContent(/tắt.*(bất cứ lúc nào|bất kỳ lúc nào)/i);
  });

  // I3 (final whole-branch review): trước fix, hộp thoại bật CHỈ nói "ghi chú cảm xúc" được gửi
  // ra ngoài — một ô tick DUY NHẤT ở đây mở CẢ chat, nên câu phải nói rõ nội dung TRÒ CHUYỆN
  // cũng rời khỏi hệ thống, không chỉ ghi chú cảm xúc.
  it("I3: hộp thoại bật nói rõ CẢ ghi chú cảm xúc LẪN nội dung trò chuyện đều gửi ra ngoài", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/trò chuyện/i);
    expect(dialog).toHaveTextContent(/ghi chú cảm xúc/i);
  });

  // I3: thân bài thường trực (không phải hộp thoại) VÀ nhãn ô tick cũng phải nói cả hai — đây
  // là những gì học sinh thấy khi chưa bấm mở hộp thoại.
  it("I3: thân bài thường trực và nhãn ô tick đều nhắc tới nội dung trò chuyện, không chỉ ghi chú cảm xúc", async () => {
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await screen.findByRole("checkbox");
    // Cả thân bài VÀ nhãn ô tick đều phải nhắc — đúng hai chỗ, không phải một.
    expect(screen.getAllByText(/trò chuyện/i).length).toBeGreaterThanOrEqual(2);
  });

  // Task 8 (design spec §3.5): kể từ khi chat có đường cảnh báo khủng hoảng tới thầy cô, và
  // cùng công tắc aiOptIn này mở cả ReflectionCard lẫn ChatWindow, hộp thoại đồng ý PHẢI nói rõ
  // cả hai điều đang được đồng ý — không chỉ "ghi chú gửi tới AI" mà còn "có đường báo an toàn
  // tới thầy cô". Thiếu câu này, một em bật AI mà không biết trước sẽ mất niềm tin nếu sau này
  // phát hiện có cảnh báo âm thầm (đúng lý do §3.5 nêu ra).
  it("hộp thoại bật cũng nói rõ có đường cảnh báo an toàn tới thầy cô — không hứa giữ bí mật tuyệt đối", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/thầy cô/i);
    expect(dialog).toHaveTextContent(/an toàn/i);
    expect(dialog).toHaveTextContent(/báo/i);
  });

  it("bấm huỷ: aiOptIn không đổi, không ghi Firestore", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /huỷ/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });

  it("bấm đồng ý: ghi aiOptIn=true, ensureAuthReady chạy TRƯỚC updateDoc", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedUpdateDoc.mockImplementation(async () => {
      order.push("updateDoc");
    });

    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /đồng ý/i }));

    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "privacySettings.aiOptIn": true }),
    );
    expect(order).toEqual(["ensureAuthReady", "updateDoc"]);
  });

  it("tắt lại: hỏi xác nhận, xác nhận thì gọi deleteAllMyOutputs (xoá thật, không phải ẩn)", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/xoá/i);
    await user.click(screen.getByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(mockedDeleteAllMyOutputs).toHaveBeenCalledWith("u1"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  // M12 (final whole-branch review): handleConfirmOff chỉ xoá phản chiếu (deleteAllMyOutputs) —
  // hộp thoại phải nói rõ cuộc trò chuyện KHÔNG bị xoá theo, và chỉ đường xoá riêng, thay vì để
  // học sinh tự cho rằng "tắt AI" đã dọn sạch mọi thứ.
  it("M12: hộp thoại tắt nói rõ cuộc trò chuyện KHÔNG bị xoá theo, chỉ đường xoá riêng ở màn hình chat", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/trò chuyện/i);
    expect(dialog).toHaveTextContent(/không.*bị xoá/i);
  });

  // ==== I4 (final whole-branch review) — đồng ý dưới hộp thoại CŨ (thiếu hoặc lệch
  // aiConsentVersion) phải được coi như CHƯA đồng ý cho MỤC ĐÍCH hiện checkbox/mở hộp thoại,
  // dù aiOptIn thô vẫn true (phản chiếu vẫn hoạt động bình thường — không đổi gì ở đó).
  it("I4: aiOptIn=true nhưng THIẾU aiConsentVersion (đồng ý từ trước khi chat tồn tại) -> checkbox hiện CHƯA tick", async () => {
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={null} />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("I4: aiOptIn=true, aiConsentVersion CŨ HƠN hiện tại -> checkbox hiện CHƯA tick, bấm vào mở hộp thoại BẬT (turn-on) không phải hộp thoại TẮT — không gọi deleteAllMyOutputs", async () => {
    const user = userEvent.setup();
    render(
      <AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION - 1} />,
    );

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    const dialog = await screen.findByRole("dialog");
    // Hộp thoại BẬT nói về gửi dữ liệu ra ngoài — hộp thoại TẮT nói về xoá vĩnh viễn. Đây phải
    // là hộp thoại BẬT, không phải TẮT (khác test "tắt lại" ở trên).
    expect(dialog).toHaveTextContent(/gửi|dịch vụ/i);
    expect(dialog).not.toHaveTextContent(/xoá vĩnh viễn/i);

    await user.click(screen.getByRole("button", { name: /đồng ý/i }));

    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    // Xác nhận lại KHÔNG xoá gì — chỉ ghi lại true + version mới.
    expect(mockedDeleteAllMyOutputs).not.toHaveBeenCalled();
    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "privacySettings.aiOptIn": true,
        "privacySettings.aiConsentVersion": CURRENT_AI_CONSENT_VERSION,
      }),
    );
  });

  it("aiPublic.enabled=false (chưa cấu hình) -> hiện trạng thái chưa khả dụng, không có nút bật", async () => {
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false });
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    expect(await screen.findByText(/chưa khả dụng/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("ghi hỏng khi bật: hiện lỗi, KHÔNG đổi trạng thái công tắc", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /đồng ý/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  // Fix round 1, Finding 1: tắt phải XOÁ TRƯỚC, ghi cài đặt SAU — lời hứa
  // "xoá vĩnh viễn" ở hộp thoại chỉ được coi là giữ đúng sau khi xoá xong
  // thật. Test này khoá thứ tự để không bị đảo lại.
  it("tắt: gọi deleteAllMyOutputs TRƯỚC, rồi ensureAuthReady, rồi updateDoc", async () => {
    const order: string[] = [];
    mockedDeleteAllMyOutputs.mockImplementation(async () => {
      order.push("deleteAllMyOutputs");
      return 0;
    });
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedUpdateDoc.mockImplementation(async () => {
      order.push("updateDoc");
    });

    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(order).toEqual(["deleteAllMyOutputs", "ensureAuthReady", "updateDoc"]);
  });

  it("xoá phản chiếu lỗi khi tắt: báo đúng lỗi xoá, KHÔNG ghi cài đặt, công tắc vẫn ON, dialog vẫn mở để thử lại", async () => {
    mockedDeleteAllMyOutputs.mockRejectedValueOnce(new Error("mất mạng"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    const confirmButton = await screen.findByRole("button", { name: /tắt/i });
    await user.click(confirmButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(/xoá/i);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
    // Dialog vẫn còn mở — bấm lại đúng nút xác nhận là thử lại toàn bộ flow.
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(mockedDeleteAllMyOutputs).toHaveBeenCalledTimes(2);
  });

  it("xoá xong nhưng ghi cài đặt lỗi: dữ liệu đã xoá thật (đã gọi deleteAllMyOutputs), báo lỗi LƯU cài đặt (khác lỗi xoá), công tắc vẫn hiện ON", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(mockedDeleteAllMyOutputs).toHaveBeenCalledWith("u1"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/lưu thay đổi/i);
    expect(alert).not.toHaveTextContent(/xoá/i);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  // I2 (final whole-branch review): trước fix, !aiPublic.enabled LUÔN rơi vào panel "chưa khả
  // dụng" — bất kể aiOptIn. Một học sinh đã bật AI mà admin sau đó tắt kill switch (vd runbook
  // khẩn cấp ở docs/ai-provider-setup.md) sẽ KHÔNG còn cách nào tắt aiOptIn hay xoá các phản
  // chiếu đã lưu — đúng lúc có lý do chính đáng nhất để muốn xoá. Hai test dưới đây khoá lại:
  // đường rút lui phải LUÔN mở, bất kể trạng thái kill switch.
  it("I2: kill switch TẮT nhưng aiOptIn đã BẬT -> vẫn hiện được checkbox và luồng tắt/xoá, không rơi vào 'chưa khả dụng'", async () => {
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false });
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    expect(screen.queryByText(/chưa khả dụng/i)).not.toBeInTheDocument();
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/xoá/i);
    await user.click(screen.getByRole("button", { name: /tắt/i }));

    // Sau khi tắt thành công, aiOptIn về false VÀ kill switch vẫn tắt -> tính năng giờ THẬT SỰ
    // "chưa khả dụng" (không còn đường bật lẫn đường tắt nào để hiện) — khác `not.toBeChecked()`
    // như luồng tắt bình thường, vì ở đây không còn checkbox nào để kiểm tra nữa.
    await waitFor(() => expect(mockedDeleteAllMyOutputs).toHaveBeenCalledWith("u1"));
    expect(await screen.findByText(/chưa khả dụng/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("I2 (provider-change exposure): kill switch TẮT, aiOptIn BẬT -> KHÔNG bịa/giữ lại tên provider cũ khi aiPublic không còn xác nhận nó", async () => {
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false });
    render(<AiConsentSection uid="u1" initialAiOptIn={true} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await screen.findByRole("checkbox");
    // Panel vẫn hiện (đường rút lui mở), nhưng vì aiPublic không xác nhận provider nào (bị
    // admin tắt), màn hình KHÔNG được tự nói tên một provider — tránh nêu sai tên nhà cung cấp
    // nếu provider đã đổi trong lúc tính năng tắt (R5, spec §3.3).
    expect(screen.queryByText(/DeepSeek/)).not.toBeInTheDocument();
  });

  it("ghi hỏng khi bật (đối chứng): hiện lỗi lưu, KHÔNG gọi deleteAllMyOutputs", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} initialAiConsentVersion={CURRENT_AI_CONSENT_VERSION} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /đồng ý/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockedDeleteAllMyOutputs).not.toHaveBeenCalled();
  });
});
