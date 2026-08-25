import { requireAdmin } from "@/lib/firebase/session";
import { CrisisAlertList } from "@/components/admin/CrisisAlertList";

export const metadata = { title: "Cảnh báo" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Cảnh báo</h1>
      <CrisisAlertList adminUid={admin.uid} />
    </>
  );
}
