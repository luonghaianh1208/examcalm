import { requireAdmin } from "@/lib/firebase/session";
import { ResourceEditor } from "@/components/admin/ResourceEditor";

export const metadata = { title: "Quản lý thư viện" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý thư viện</h1>
      <ResourceEditor adminUid={admin.uid} />
    </>
  );
}
