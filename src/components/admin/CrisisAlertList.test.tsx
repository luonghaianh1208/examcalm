import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  listCrisisAlerts, markCrisisAlertHandled, reopenCrisisAlert,
  type CrisisAlertRecord,
} from "@/lib/firestore/admin-crisis";
import { CrisisAlertList } from "./CrisisAlertList";

// Chỉ mock các hàm gọi Firestore — cùng phong cách AiConfigEditor.test.tsx/UserRoleManager.test.tsx.
vi.mock("@/lib/firestore/admin-crisis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/admin-crisis")>();
  return {
    ...actual,
    listCrisisAlerts: vi.fn(),
    markCrisisAlertHandled: vi.fn(),
    reopenCrisisAlert: vi.fn(),
  };
});

const mockedListCrisisAlerts = vi.mocked(listCrisisAlerts);
const mockedMarkCrisisAlertHandled = vi.mocked(markCrisisAlertHandled);
const mockedReopenCrisisAlert = vi.mocked(reopenCrisisAlert);

const UNHANDLED_URGENT: CrisisAlertRecord = {
  id: "a-unhandled", userId: "student-u1", severity: "urgent", triggeredBy: "keyword",
  createdAt: new Date("2026-08-24T10:00:00Z"), handledBy: null, handledAt: null,
};

const HANDLED: CrisisAlertRecord = {
  id: "a-handled", userId: "student-u2", severity: "concern", triggeredBy: "model",
  createdAt: new Date("2026-08-23T09:00:00Z"), handledBy: "admin-other", handledAt: new Date("2026-08-23T09:30:00Z"),
};

async function renderReady(alerts: CrisisAlertRecord[]) {
  mockedListCrisisAlerts.mockResolvedValue(alerts);
  render(<CrisisAlertList adminUid="admin-1" />);
  await waitFor(() => {
    expect(mockedListCrisisAlerts).toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CrisisAlertList — dòng hướng dẫn (task-9-brief.md: 'trang nói rõ việc cần làm là ĐI GẶP học sinh')", () => {
  it("hiện câu hướng dẫn đi gặp trực tiếp học sinh, không phải đọc hồ sơ", async () => {
    await renderReady([]);
    expect(screen.getByText(/đi gặp/i)).toBeInTheDocument();
  });
});

describe("CrisisAlertList — liệt kê", () => {
  it("hiện severity, thời điểm, và định danh học sinh cho mỗi dòng", async () => {
    await renderReady([UNHANDLED_URGENT]);

    expect(screen.getByText(/khẩn cấp/i)).toBeInTheDocument();
    expect(screen.getByText(/student-u1/)).toBeInTheDocument();
    // Thời điểm được format — không hiện ISO thô, nhưng phải chứa năm/giờ nào đó trên màn hình.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("giữ nguyên thứ tự mảng nhận được (nguồn sự thật duy nhất về sắp xếp là listCrisisAlerts)", async () => {
    await renderReady([UNHANDLED_URGENT, HANDLED]);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("student-u1");
    expect(items[1]).toHaveTextContent("student-u2");
  });

  it("danh sách rỗng -> hiện thông báo trung tính, không crash", async () => {
    await renderReady([]);
    expect(screen.getByText(/chưa có cảnh báo/i)).toBeInTheDocument();
  });

  // Guard load-bearing (task-9-brief.md: "Test khẳng định trang không render field nào ngoài
  // danh sách cho phép"). Giả lập một field lạ SỐNG SÓT tới tận component (vd một lỗi tương lai
  // ở admin-crisis.ts làm rớt việc lọc field) — trang này KHÔNG được render nó ra DOM, vì render
  // chỉ đọc field cụ thể (alert.severity/createdAt/userId/handledBy/handledAt), không bao giờ
  // lặp Object.keys(alert) hay JSON.stringify(alert) để hiện "mọi thứ nó có".
  it("field lạ ngoài crisisAlertSchema (vd messageText) KHÔNG bao giờ được render", async () => {
    const leaky = {
      ...UNHANDLED_URGENT,
      messageText: "NGUYÊN VĂN BÍ MẬT CỦA HỌC SINH",
    } as unknown as CrisisAlertRecord;
    await renderReady([leaky]);

    expect(screen.queryByText(/NGUYÊN VĂN BÍ MẬT CỦA HỌC SINH/)).not.toBeInTheDocument();
  });
});

describe("CrisisAlertList — khoá trạng thái đã xử lý theo handledBy, KHÔNG BAO GIỜ handledAt", () => {
  // task-9-brief.md, "Ba chi tiết" mục 1 — LOAD-BEARING: một cảnh báo được MỞ LẠI
  // (handledBy: null) trong khi handledAt CŨ vẫn còn sót lại phải hiện ra như CHƯA xử lý.
  it("cảnh báo mở lại (handledBy: null, handledAt CŨ còn sót) hiện nút 'Đánh dấu đã xử lý', KHÔNG hiện 'Đã xử lý'", async () => {
    const reopened: CrisisAlertRecord = {
      ...UNHANDLED_URGENT,
      id: "a-reopened",
      handledBy: null,
      handledAt: new Date("2026-08-01T00:00:00Z"), // sót lại từ lần xử lý trước
    };
    await renderReady([reopened]);

    expect(screen.getByRole("button", { name: /đánh dấu đã xử lý/i })).toBeInTheDocument();
    expect(screen.queryByText(/đã xử lý bởi/i)).not.toBeInTheDocument();
  });
});

describe("CrisisAlertList — đánh dấu đã xử lý (tự nhận bằng chính admin đang đăng nhập)", () => {
  it("bấm 'Đánh dấu đã xử lý' -> gọi markCrisisAlertHandled với alertId và ĐÚNG adminUid hiện tại", async () => {
    await renderReady([UNHANDLED_URGENT]);

    await userEvent.click(screen.getByRole("button", { name: /đánh dấu đã xử lý/i }));

    await waitFor(() => {
      expect(mockedMarkCrisisAlertHandled).toHaveBeenCalledWith("a-unhandled", "admin-1");
    });
  });
});

describe("CrisisAlertList — mở lại (khả dụng cho BẤT KỲ admin nào)", () => {
  // task-9-brief.md, "Ba chi tiết" mục 3: một cảnh báo bị xử lý bởi admin KHÁC (không phải
  // adminUid đang đăng nhập) vẫn phải mở lại được — không bị khoá chỉ vì người xử lý sai đó
  // không có mặt.
  it("cảnh báo đã xử lý bởi admin KHÁC vẫn hiện nút 'Mở lại', bấm được", async () => {
    await renderReady([HANDLED]); // handledBy: "admin-other", đang đăng nhập là "admin-1"

    const reopenButton = screen.getByRole("button", { name: /mở lại/i });
    expect(reopenButton).toBeInTheDocument();

    await userEvent.click(reopenButton);

    await waitFor(() => {
      expect(mockedReopenCrisisAlert).toHaveBeenCalledWith("a-handled");
    });
  });

  it("cảnh báo đã xử lý hiện chữ 'Đã xử lý bởi' — không hiện nút 'Đánh dấu đã xử lý' nữa", async () => {
    await renderReady([HANDLED]);

    expect(screen.getByText(/đã xử lý bởi/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^đánh dấu đã xử lý$/i })).not.toBeInTheDocument();
  });
});

describe("CrisisAlertList — tải lỗi (vd non-admin bị chặn bởi rules)", () => {
  it("listCrisisAlerts thất bại -> hiện thông báo lỗi kèm nút thử lại, không crash", async () => {
    mockedListCrisisAlerts.mockRejectedValue(new Error("permission-denied"));
    render(<CrisisAlertList adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /thử tải lại/i })).toBeInTheDocument();
  });
});
