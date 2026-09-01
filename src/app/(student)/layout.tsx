import { requireUser } from "@/lib/firebase/session";
import { AppShell } from "@/components/shell/AppShell";
import { STUDENT_NAV } from "@/lib/nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // requireUser() chuyển hướng khi chưa đăng nhập, nên tới được đây là chắc
  // chắn có user — không cần gọi getSessionUser() thêm lần nữa.
  const user = await requireUser();
  return (
    <AppShell nav={STUDENT_NAV} user={user}>
      {children}
    </AppShell>
  );
}
