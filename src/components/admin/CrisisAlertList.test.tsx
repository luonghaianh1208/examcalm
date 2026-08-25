import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  listCrisisAlerts, markCrisisAlertHandled, reopenCrisisAlert,
  type CrisisAlertRecord,
} from "@/lib/firestore/admin-crisis";
import type { UserSummary } from "@/lib/firestore/admin-users";
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

// Fix round 1, Finding 1 (CRITICAL): admin-crisis.ts chỉ trả userId — trang phải join sang
// users/{uid} (qua prop studentsByUid, đổ từ listUsers() ở page.tsx server-side) để thực sự nói
// được "học sinh nào". student-u2 CỐ Ý không có trong danh bạ này để pin đường fallback (tài
// khoản đã xoá) — chỉ student-u1 có mặt.
const STUDENTS: Record<string, UserSummary> = {
  "student-u1": { uid: "student-u1", nickname: "Mèo con", school: "THPT A", gradeLevel: "12", role: "student" },
};

async function renderReady(alerts: CrisisAlertRecord[], studentsByUid: Record<string, UserSummary> = STUDENTS) {
  mockedListCrisisAlerts.mockResolvedValue({ alerts, truncated: false });
  render(<CrisisAlertList adminUid="admin-1" studentsByUid={studentsByUid} />);
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
    expect(screen.getByText(/mèo con/i)).toBeInTheDocument();
    // Thời điểm được format — không hiện ISO thô, nhưng phải chứa năm/giờ nào đó trên màn hình.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("giữ nguyên thứ tự mảng nhận được (nguồn sự thật duy nhất về sắp xếp là listCrisisAlerts)", async () => {
    await renderReady([UNHANDLED_URGENT, HANDLED]);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Mèo con");
    // student-u2 (HANDLED) không có trong STUDENTS -> fallback hiện mã thô, xem nhóm test bên dưới.
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

// Fix round 1, Finding 1 (CRITICAL — reviewer): raw uid là một ngõ cụt trong sản phẩm — không
// trang admin nào khác (kể cả nguoi-dung/UserRoleManager.tsx) hiện hay tìm được theo uid. Trang
// này PHẢI hiện được danh tính dùng được (nickname · lớp · trường), fallback về mã thô CHỈ khi
// join không khớp (tài khoản đã xoá).
describe("CrisisAlertList — định danh học sinh dùng được (Fix round 1, Finding 1)", () => {
  it("học sinh có trong danh bạ -> hiện nickname · Lớp · trường, KHÔNG hiện mã uid thô", async () => {
    await renderReady([UNHANDLED_URGENT]);

    expect(screen.getByText(/mèo con/i)).toBeInTheDocument();
    expect(screen.getByText(/lớp 12/i)).toBeInTheDocument();
    expect(screen.getByText(/thpt a/i)).toBeInTheDocument();
    expect(screen.queryByText("student-u1")).not.toBeInTheDocument();
  });

  it("học sinh KHÔNG có trong danh bạ (tài khoản đã xoá) -> fallback hiện mã học sinh thô", async () => {
    await renderReady([HANDLED]); // student-u2 không có trong STUDENTS

    expect(screen.getByText(/student-u2/)).toBeInTheDocument();
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

  // Fix round 1, Finding 4: load() sau khi mark/reopen giờ ĐƯỢC AWAIT — nút không được phép bật
  // lại (disabled=false) trong khi danh sách hiển thị vẫn còn là dòng CŨ (chưa xử lý). Trước
  // fix, `finally` chạy ngay sau markCrisisAlertHandled() resolve, không đợi load() (fire-and-
  // forget) — nút nháy bật lại rồi tắt lại khi dòng mới tới.
  it("Fix round 1, Finding 4: nút vẫn disabled tới khi danh sách MỚI tải xong — không nháy dòng cũ", async () => {
    mockedListCrisisAlerts.mockResolvedValueOnce({ alerts: [UNHANDLED_URGENT], truncated: false });
    let resolveReload!: (value: { alerts: CrisisAlertRecord[]; truncated: boolean }) => void;
    mockedListCrisisAlerts.mockImplementationOnce(
      () => new Promise<{ alerts: CrisisAlertRecord[]; truncated: boolean }>((resolve) => { resolveReload = resolve; }),
    );
    mockedMarkCrisisAlertHandled.mockResolvedValue(undefined);

    render(<CrisisAlertList adminUid="admin-1" studentsByUid={STUDENTS} />);
    await waitFor(() => expect(mockedListCrisisAlerts).toHaveBeenCalledTimes(1));

    const button = screen.getByRole("button", { name: /đánh dấu đã xử lý/i });
    await userEvent.click(button);

    // markCrisisAlertHandled() đã resolve; load() (lần tải lại) vẫn ĐANG PENDING -> nút PHẢI
    // vẫn disabled, và dòng hiển thị vẫn là dòng CŨ (chưa xử lý).
    await waitFor(() => expect(mockedMarkCrisisAlertHandled).toHaveBeenCalled());
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: /đánh dấu đã xử lý/i })).toBeInTheDocument();

    resolveReload({
      alerts: [{ ...UNHANDLED_URGENT, handledBy: "admin-1", handledAt: new Date("2026-08-24T10:05:00Z") }],
      truncated: false,
    });

    await waitFor(() => {
      expect(screen.getByText(/đã xử lý bởi admin-1/i)).toBeInTheDocument();
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

// Fix round 1, Finding 5: timestamp không đọc được (document lệch hình dạng) trước đây rơi về
// new Date(0) — hiện "1 thg 1, 1970" trên một dòng cảnh báo khủng hoảng, đọc như một thời điểm
// THẬT chứ không phải "không đọc được". Giờ phải hiện chữ nói rõ KHÔNG rõ thời điểm.
describe("CrisisAlertList — thời điểm không đọc được (Fix round 1, Finding 5)", () => {
  it("createdAt là Invalid Date (fallback từ document lệch hình dạng) -> hiện 'Không rõ thời điểm', không crash, không hiện ngày 1970", async () => {
    const corrupted: CrisisAlertRecord = { ...UNHANDLED_URGENT, id: "a-corrupt", createdAt: new Date(NaN) };
    await renderReady([corrupted]);

    expect(screen.getByText(/không rõ thời điểm/i)).toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });
});

// I6 (final whole-branch review): danh sách "gần đây" có thể bị cắt bởi trần max — trang phải
// nói rõ điều đó thay vì trông gọn gàng như đã hiện đủ mọi cảnh báo.
describe("CrisisAlertList — truncated (I6, final whole-branch review)", () => {
  it("truncated=true -> hiện dòng cảnh báo về danh sách có thể chưa đầy đủ", async () => {
    mockedListCrisisAlerts.mockResolvedValue({ alerts: [UNHANDLED_URGENT], truncated: true });
    render(<CrisisAlertList adminUid="admin-1" studentsByUid={STUDENTS} />);

    await waitFor(() => expect(mockedListCrisisAlerts).toHaveBeenCalled());
    expect(await screen.findByText(/có thể chưa hiện hết/i)).toBeInTheDocument();
  });

  it("truncated=false -> KHÔNG hiện dòng cảnh báo đó", async () => {
    await renderReady([UNHANDLED_URGENT]);
    expect(screen.queryByText(/có thể chưa hiện hết/i)).not.toBeInTheDocument();
  });
});

// ExamCalm Spec #5, Task 3 (task-3-brief.md, "Bốn trạng thái không quan trọng như nhau"):
// "failed" phải NỔI BẬT — nghĩa là KHÔNG ai được báo qua mail, và thầy cô chỉ biết nếu tình cờ
// mở trang này. "skipped" KHÔNG được đọc như "admin đã tắt" (một cấu hình sai hình dạng cũng ra
// "failed", còn cấu hình THIẾU mới ra "skipped" — hai chữ đó không được lẫn vào nhau). "absent"
// (field vắng mặt) đọc như "chưa rõ", không phải thành công hay thất bại.
describe("CrisisAlertList — trạng thái gửi mail (ExamCalm Spec #5, Task 3)", () => {
  it("emailStatus 'sent' -> hiện 'đã gửi', kèm mốc thời gian emailedAt", async () => {
    const sent: CrisisAlertRecord = {
      ...UNHANDLED_URGENT,
      emailStatus: "sent",
      emailedAt: new Date("2026-08-24T10:00:05Z"),
    };
    await renderReady([sent]);

    expect(screen.getByText(/đã gửi mail cảnh báo lúc.*2026/i)).toBeInTheDocument();
  });

  it("emailStatus 'failed' -> hiện rõ 'không ai được báo qua mail', và nổi bật hơn các trạng thái khác (không dùng cùng class với 'sent'/'skipped')", async () => {
    const failed: CrisisAlertRecord = { ...UNHANDLED_URGENT, emailStatus: "failed", emailedAt: null };
    await renderReady([failed]);

    const failedNode = screen.getByText(/không ai được báo qua mail/i);
    expect(failedNode).toBeInTheDocument();
    // "Nổi bật" ở đây nghĩa là dùng một class NGOÀI class trung tính (text-slate-500) mà các
    // trạng thái khác dùng — pin cụ thể bằng nền màu cảnh báo mạnh (rose), không phải suy đoán
    // chung chung "trông khác".
    expect(failedNode.className).toMatch(/rose/);
  });

  it("emailStatus 'skipped' -> hiện chữ trung tính, KHÔNG khẳng định 'admin đã tắt'", async () => {
    const skipped: CrisisAlertRecord = { ...UNHANDLED_URGENT, emailStatus: "skipped", emailedAt: null };
    await renderReady([skipped]);

    expect(screen.getByText(/bỏ qua/i)).toBeInTheDocument();
    // Chữ không được khẳng định "admin đã tắt" — một cấu hình THIẾU (chưa từng cấu hình) cũng ra
    // "skipped", không chỉ trường hợp admin chủ ý tắt.
    expect(screen.queryByText(/admin đã tắt/i)).not.toBeInTheDocument();
  });

  it("emailStatus vắng mặt (null từ admin-crisis.ts) -> hiện 'chưa rõ', KHÔNG phải 'đã gửi' hay 'gửi hỏng'", async () => {
    const unknown: CrisisAlertRecord = { ...UNHANDLED_URGENT, emailStatus: null, emailedAt: null };
    await renderReady([unknown]);

    expect(screen.getByText(/chưa rõ/i)).toBeInTheDocument();
  });
});

describe("CrisisAlertList — tải lỗi (vd non-admin bị chặn bởi rules)", () => {
  it("listCrisisAlerts thất bại -> hiện thông báo lỗi kèm nút thử lại, không crash", async () => {
    mockedListCrisisAlerts.mockRejectedValue(new Error("permission-denied"));
    render(<CrisisAlertList adminUid="admin-1" studentsByUid={STUDENTS} />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /thử tải lại/i })).toBeInTheDocument();
  });
});
