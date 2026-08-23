import { requireAdmin } from "@/lib/firebase/session";
import { listUsers } from "@/lib/firestore/admin-users";
import { UserRoleManager } from "@/components/admin/UserRoleManager";

export const metadata = { title: "Người dùng · ExamCalm" };

export default async function Page() {
  const admin = await requireAdmin();
  const users = await listUsers();

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Người dùng</h1>
      <p className="mb-6 text-slate-600">
        Trang này chỉ hiển thị thông tin hành chính. Nhật ký cảm xúc và kết quả test
        của học sinh là dữ liệu riêng tư, quản trị viên không đọc được.
      </p>
      <UserRoleManager users={users} currentAdminUid={admin.uid} />
    </>
  );
}
