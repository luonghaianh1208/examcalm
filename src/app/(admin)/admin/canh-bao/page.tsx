import { requireAdmin } from "@/lib/firebase/session";
import { listUsers } from "@/lib/firestore/admin-users";
import { CrisisAlertList } from "@/components/admin/CrisisAlertList";

export const metadata = { title: "Cảnh báo" };

export default async function Page() {
  const admin = await requireAdmin();
  // Fix round 1, Finding 1 (CRITICAL): crisisAlerts chỉ mang userId (design spec §3.4) — join
  // sang users/{uid} NGAY TẠI ĐÂY (server, cùng pattern nguoi-dung/page.tsx) để trang thực sự
  // nói được "học sinh nào", không chỉ "có một học sinh nào đó". Không có access delta: admin
  // đã đọc được mọi users/{uid} qua firestore.rules (isAdmin()), listUsers() chỉ trả field hành
  // chính (nickname/school/gradeLevel), không phải nội dung riêng tư.
  const users = await listUsers();
  const studentsByUid = Object.fromEntries(users.map((u) => [u.uid, u]));

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Cảnh báo</h1>
      <CrisisAlertList adminUid={admin.uid} studentsByUid={studentsByUid} />
    </>
  );
}
