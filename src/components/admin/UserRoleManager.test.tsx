import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRoleManager } from "./UserRoleManager";
import { callSetUserRole } from "@/lib/firebase/functions-client";

vi.mock("@/lib/firebase/functions-client", () => ({
  callSetUserRole: vi.fn().mockResolvedValue(undefined),
}));

// UserRoleManager gọi router.refresh() sau khi đổi vai trò — App Router context
// không tồn tại trong môi trường test, nên phải mock useRouter().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockedCallSetUserRole = vi.mocked(callSetUserRole);

const USERS = [
  { uid: "u1", nickname: "Mèo con", school: "THPT A", gradeLevel: "12", role: "student" as const },
  { uid: "a1", nickname: "Quản trị", school: "THPT A", gradeLevel: "12", role: "admin" as const },
];

beforeEach(() => vi.clearAllMocks());

describe("UserRoleManager", () => {
  it("liệt kê người dùng cùng vai trò", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.getByText("Mèo con")).toBeInTheDocument();
    expect(screen.getByText("Quản trị")).toBeInTheDocument();
  });

  it("KHÔNG hiển thị nội dung nhật ký hay điểm test của học sinh", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.queryByText(/nhật ký|điểm test|mood/i)).not.toBeInTheDocument();
  });

  it("gọi callSetUserRole khi nâng quyền", async () => {
    const user = userEvent.setup();
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    await user.click(screen.getByRole("button", { name: /nâng thành quản trị/i }));
    expect(callSetUserRole).toHaveBeenCalledWith("u1", "admin");
  });

  it("không cho admin đang đăng nhập tự hạ quyền chính mình", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.queryByRole("button", { name: /hạ xuống học sinh/i })).not.toBeInTheDocument();
  });

  // Follow-up: hồ sơ vá cho tài khoản bootstrap ngoài app (ensureUserProfile) không ghi
  // gradeLevel/school -> listUsers() (admin-users.ts) đổ về "" cho hai field này. Trang phải
  // hiện "Không rõ" (khớp chữ mail cảnh báo khủng hoảng dùng cho cùng tình huống), không được
  // hiện mảnh vỡ "Lớp  · " rỗng như thể document lỗi.
  it("gradeLevel/school rỗng (hồ sơ vá cho tài khoản bootstrap ngoài app) -> hiện 'Không rõ', không hiện mảnh vỡ rỗng", () => {
    const usersWithUnsetProfile = [
      { uid: "u3", nickname: "quan.tri", school: "", gradeLevel: "", role: "admin" as const },
    ];
    render(<UserRoleManager users={usersWithUnsetProfile} currentAdminUid="a1" />);
    expect(screen.getByText("Lớp Không rõ · Không rõ")).toBeInTheDocument();
  });

  it("khi mirrorWriteFailed=true: báo trạng thái cảnh báo, KHÔNG báo lỗi", async () => {
    mockedCallSetUserRole.mockResolvedValueOnce({ ok: true, role: "admin", mirrorWriteFailed: true });
    const user = userEvent.setup();
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    await user.click(screen.getByRole("button", { name: /nâng thành quản trị/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/danh sách.*chưa cập nhật|có thể chưa cập nhật/i);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
