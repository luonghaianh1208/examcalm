import { requireAdmin } from "@/lib/firebase/session";
import { CbtEditor } from "@/components/admin/CbtEditor";

export const metadata = { title: "Quản lý bài tập CBT" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý bài tập CBT</h1>
      <CbtEditor adminUid={admin.uid} />
    </>
  );
}
