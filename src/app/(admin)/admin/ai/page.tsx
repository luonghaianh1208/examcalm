import { requireAdmin } from "@/lib/firebase/session";
import { AiConfigEditor } from "@/components/admin/AiConfigEditor";

export const metadata = { title: "Quản lý AI" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý AI</h1>
      <AiConfigEditor adminUid={admin.uid} />
    </>
  );
}
