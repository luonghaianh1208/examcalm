import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiConsentSection } from "./AiConsentSection";
import { updateDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";
import { deleteAllMyOutputs } from "@/lib/firestore/ai-outputs";

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
  mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "DeepSeek", enabled: true });
  mockedDeleteAllMyOutputs.mockResolvedValue(0);
});

describe("AiConsentSection", () => {
  it("mặc định hiển thị trạng thái tắt", async () => {
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });

  it("trước khi bật: hộp thoại nêu đích danh providerLabel đọc từ aiPublic (không phải chuỗi cứng)", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/DeepSeek/)).toBeInTheDocument();
  });

  it("hộp thoại nói rõ ghi chú gửi tới dịch vụ bên ngoài và có thể tắt bất cứ lúc nào", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

    await user.click(await screen.findByRole("checkbox"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/(gửi|dịch vụ).*(bên ngoài)/i);
    expect(dialog).toHaveTextContent(/tắt.*(bất cứ lúc nào|bất kỳ lúc nào)/i);
  });

  it("bấm huỷ: aiOptIn không đổi, không ghi Firestore", async () => {
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

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
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

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
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/xoá/i);
    await user.click(screen.getByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(mockedDeleteAllMyOutputs).toHaveBeenCalledWith("u1"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("aiPublic.enabled=false (chưa cấu hình) -> hiện trạng thái chưa khả dụng, không có nút bật", async () => {
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false });
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

    expect(await screen.findByText(/chưa khả dụng/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("ghi hỏng khi bật: hiện lỗi, KHÔNG đổi trạng thái công tắc", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

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
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /tắt/i }));

    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(order).toEqual(["deleteAllMyOutputs", "ensureAuthReady", "updateDoc"]);
  });

  it("xoá phản chiếu lỗi khi tắt: báo đúng lỗi xoá, KHÔNG ghi cài đặt, công tắc vẫn ON, dialog vẫn mở để thử lại", async () => {
    mockedDeleteAllMyOutputs.mockRejectedValueOnce(new Error("mất mạng"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

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
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

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
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false });
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

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
    mockedGetAiPublicConfig.mockResolvedValue({ providerLabel: "", enabled: false });
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

    await screen.findByRole("checkbox");
    // Panel vẫn hiện (đường rút lui mở), nhưng vì aiPublic không xác nhận provider nào (bị
    // admin tắt), màn hình KHÔNG được tự nói tên một provider — tránh nêu sai tên nhà cung cấp
    // nếu provider đã đổi trong lúc tính năng tắt (R5, spec §3.3).
    expect(screen.queryByText(/DeepSeek/)).not.toBeInTheDocument();
  });

  it("ghi hỏng khi bật (đối chứng): hiện lỗi lưu, KHÔNG gọi deleteAllMyOutputs", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={false} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /đồng ý/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockedDeleteAllMyOutputs).not.toHaveBeenCalled();
  });
});
