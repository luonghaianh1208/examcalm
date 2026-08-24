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

  it("aiPublic.baseUrl coi như rỗng (enabled=false) -> hiện trạng thái chưa khả dụng, không có nút bật", async () => {
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

  it("ghi hỏng khi tắt: hiện lỗi, KHÔNG đổi trạng thái công tắc, không xoá dữ liệu", async () => {
    mockedUpdateDoc.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<AiConsentSection uid="u1" initialAiOptIn={true} />);

    await user.click(await screen.findByRole("checkbox"));
    await user.click(await screen.findByRole("button", { name: /tắt/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(mockedDeleteAllMyOutputs).not.toHaveBeenCalled();
  });
});
