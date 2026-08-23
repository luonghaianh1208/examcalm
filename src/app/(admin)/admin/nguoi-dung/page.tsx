import { requireAdmin } from "@/lib/firebase/session";
import { listUsers } from "@/lib/firestore/admin-users";
import { UserRoleManager } from "@/components/admin/UserRoleManager";

export const metadata = { title: "Người dùng" };

export default async function Page() {
  const admin = await requireAdmin();
  const users = await listUsers();

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Người dùng</h1>
      <p className="mb-6 text-slate-600">
        Trang này chỉ hiển thị thông tin hành chính. Nhật ký cảm xúc của học sinh là dữ liệu
        riêng tư, bạn không đọc được. Với bài test, bạn xem được điểm số và mức độ để nhận ra
        học sinh cần hỗ trợ, nhưng không xem được đáp án từng câu các em đã chọn.
      </p>
      <UserRoleManager users={users} currentAdminUid={admin.uid} />
    </>
  );
}
