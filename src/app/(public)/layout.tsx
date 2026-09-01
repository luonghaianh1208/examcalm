import { getSessionUser } from "@/lib/firebase/session";
import { AppShell } from "@/components/shell/AppShell";
import { STUDENT_NAV } from "@/lib/nav";

/**
 * Trang công khai: khách vào được, người đã đăng nhập cũng vào được.
 *
 * Vẫn dùng chung AppShell với khu học sinh — Brand Guideline trang 20 vẽ trang
 * chủ cho khách kèm nguyên sidebar, vì ba cửa vào theo nhu cầu chỉ có nghĩa khi
 * khách nhìn thấy app thật chứ không phải một trang giới thiệu tách rời.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <AppShell nav={STUDENT_NAV} user={user}>
      {children}
    </AppShell>
  );
}
