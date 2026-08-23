import { requireAdmin } from "@/lib/firebase/session";
import { TestEditor } from "@/components/admin/TestEditor";

export const metadata = { title: "Quản lý bài test · ExamCalm" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý bài test</h1>
      <TestEditor adminUid={admin.uid} />
    </>
  );
}
