import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseTestDraft, listAllTests, saveTest, publishTest } from "@/lib/firestore/admin-tests";
import { TestEditor } from "./TestEditor";
import type { TestRecord } from "@/lib/firestore/admin-tests";

// Giữ nguyên parseTestDraft thật (logic thuần, không đụng Firestore) — chỉ
// mock các hàm gọi Firestore để component test không cần emulator.
vi.mock("@/lib/firestore/admin-tests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/admin-tests")>();
  return {
    ...actual,
    listAllTests: vi.fn(),
    saveTest: vi.fn(),
    publishTest: vi.fn(),
  };
});

const mockedListAllTests = vi.mocked(listAllTests);
const mockedSaveTest = vi.mocked(saveTest);
const mockedPublishTest = vi.mocked(publishTest);

const VALID = JSON.stringify({
  title: "Test lo âu (mẫu)",
  version: 1,
  isSampleContent: true,
  disclaimer: "Đây không phải chẩn đoán y khoa.",
  questions: [{ id: "q1", text: "Bạn có khó ngủ?", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 2 },
  ]}],
  scoring: { thresholds: [{ min: 0, max: 2, level: "thap", interpretation: "Mức thấp." }] },
});

describe("parseTestDraft", () => {
  it("chấp nhận JSON hợp lệ", () => {
    const r = parseTestDraft(VALID);
    expect(r.ok).toBe(true);
  });

  it("báo lỗi rõ ràng khi JSON sai cú pháp", () => {
    const r = parseTestDraft("{khong-phai-json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/i);
  });

  it("từ chối khi thiếu disclaimer", () => {
    const draft = JSON.parse(VALID);
    delete draft.disclaimer;
    expect(parseTestDraft(JSON.stringify(draft)).ok).toBe(false);
  });

  it("từ chối câu hỏi chỉ có 1 lựa chọn", () => {
    const draft = JSON.parse(VALID);
    draft.questions[0].options = [{ label: "Không", score: 0 }];
    expect(parseTestDraft(JSON.stringify(draft)).ok).toBe(false);
  });

  it("từ chối khi hai câu hỏi trùng id", () => {
    const draft = JSON.parse(VALID);
    draft.questions.push({ ...draft.questions[0] });
    const r = parseTestDraft(JSON.stringify(draft));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trùng/i);
  });

  it("từ chối khi ngưỡng có min lớn hơn max", () => {
    const draft = JSON.parse(VALID);
    draft.scoring.thresholds = [{ min: 5, max: 1, level: "x", interpretation: "X" }];
    const r = parseTestDraft(JSON.stringify(draft));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ngưỡng/i);
  });
});

const record1: TestRecord = {
  id: "t1",
  title: "Test hiện có",
  version: 1,
  status: "draft",
  isSampleContent: true,
  disclaimer: "Không phải chẩn đoán.",
  questions: [{ id: "q1", text: "Câu 1", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 1 },
  ]}],
  scoring: { thresholds: [{ min: 0, max: 1, level: "thap", interpretation: "Thấp." }] },
  updatedBy: "admin-0",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TestEditor", () => {
  it("khi tải danh sách thất bại: hiện lỗi rõ ràng kèm nút thử lại, KHÔNG mãi mãi là khung chờ", async () => {
    mockedListAllTests.mockRejectedValue(new Error("network lỗi"));
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách bài test/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /thử tải lại/i })).toBeInTheDocument();
    expect(screen.queryByText(/chưa có bài test nào/i)).not.toBeInTheDocument();
  });

  it("bấm thử tải lại sau khi lỗi thì tải lại thành công", async () => {
    mockedListAllTests.mockRejectedValueOnce(new Error("network lỗi"));
    mockedListAllTests.mockResolvedValueOnce([]);
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách bài test/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /thử tải lại/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa có bài test nào/i)).toBeInTheDocument();
    });
  });

  it("khi tải thành công nhưng chưa có bài test nào: hiện đúng trạng thái rỗng, không phải lỗi", async () => {
    mockedListAllTests.mockResolvedValue([]);
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa có bài test nào/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa tải được danh sách bài test/i)).not.toBeInTheDocument();
  });

  it("hiện danh sách kèm nhãn nội dung mẫu khi isSampleContent = true", async () => {
    mockedListAllTests.mockResolvedValue([record1]);
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });
    // Khoanh vùng trong DÒNG DANH SÁCH: form bên dưới cũng có ô đánh dấu
    // "Nội dung mẫu", nên tìm trên cả trang sẽ khớp hai chỗ.
    expect(within(screen.getByRole("listitem")).getByText(/nội dung mẫu/i)).toBeInTheDocument();
  });

  it("lưu bản nháp thành công: hiện thông báo và tải lại danh sách", async () => {
    mockedListAllTests.mockResolvedValueOnce([]);
    mockedSaveTest.mockResolvedValue("new-id");
    mockedListAllTests.mockResolvedValueOnce([record1]);
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa có bài test nào/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/đã lưu bản nháp/i);
    });
    expect(mockedSaveTest).toHaveBeenCalledWith(null, expect.anything(), "admin-1");
    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });
  });

  it("form thiếu trường bắt buộc thì báo lỗi qua role=alert và KHÔNG gọi saveTest", async () => {
    mockedListAllTests.mockResolvedValue([]);
    render(<TestEditor adminUid="admin-1" />);
    await waitFor(() => {
      expect(screen.getByText(/chưa có bài test nào/i)).toBeInTheDocument();
    });

    await userEvent.clear(screen.getByLabelText("Tiêu đề"));
    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/title/i);
    });
    expect(mockedSaveTest).not.toHaveBeenCalled();
  });

  it("JSON dán vào sai cú pháp thì báo lỗi và KHÔNG ghi đè form", async () => {
    mockedListAllTests.mockResolvedValue([]);
    render(<TestEditor adminUid="admin-1" />);
    await waitFor(() => {
      expect(screen.getByText(/chưa có bài test nào/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Nội dung dạng JSON"), {
      target: { value: "{khong-phai-json" },
    });
    await userEvent.click(screen.getByRole("button", { name: /áp dụng json/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/cú pháp/i);
    });
    // Nội dung đang soạn dở không được phép biến mất vì một lần dán hỏng.
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Test lo âu (mẫu)");
  });

  it("khi tải lại SAU khi lưu thất bại: chuyển sang trạng thái lỗi, KHÔNG để admin tưởng danh sách cũ vẫn còn đúng", async () => {
    mockedListAllTests.mockResolvedValueOnce([record1]);
    mockedSaveTest.mockResolvedValue("new-id");
    mockedListAllTests.mockRejectedValueOnce(new Error("network lỗi"));
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách bài test/i)).toBeInTheDocument();
    });
    // Danh sách cũ (có thể đã lỗi thời) không còn được hiển thị như thể vẫn đúng.
    expect(screen.queryByText("Test hiện có")).not.toBeInTheDocument();
  });

  it("bấm Sửa nạp đúng nội dung bài test hiện có vào form", async () => {
    mockedListAllTests.mockResolvedValue([record1]);
    render(<TestEditor adminUid="admin-1" />);
    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^sửa$/i }));

    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Test hiện có");
    expect(screen.getByLabelText("Nội dung câu hỏi")).toHaveValue("Câu 1");
    expect(screen.getByRole("heading", { name: /sửa bài test/i })).toBeInTheDocument();
  });

  it("bấm Đăng gọi publishTest với publish=true rồi tải lại danh sách", async () => {
    mockedListAllTests.mockResolvedValueOnce([record1]);
    mockedPublishTest.mockResolvedValue(undefined);
    mockedListAllTests.mockResolvedValueOnce([{ ...record1, status: "published" }]);
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^đăng$/i }));

    expect(mockedPublishTest).toHaveBeenCalledWith("t1", true);
    await waitFor(() => {
      expect(screen.getByText(/v1 · published/i)).toBeInTheDocument();
    });
  });

  it("khi tải lại SAU khi đổi trạng thái đăng thất bại: chuyển sang trạng thái lỗi thay vì giữ danh sách cũ", async () => {
    mockedListAllTests.mockResolvedValueOnce([record1]);
    mockedPublishTest.mockResolvedValue(undefined);
    mockedListAllTests.mockRejectedValueOnce(new Error("network lỗi"));
    render(<TestEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Test hiện có")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^đăng$/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách bài test/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Test hiện có")).not.toBeInTheDocument();
  });
});
