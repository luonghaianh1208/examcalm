import { requireUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { ResearchConsentForm } from "@/components/settings/ResearchConsentForm";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";

export const metadata = { title: "Hồ sơ · ExamCalm" };

export default async function Page() {
  const user = await requireUser();
  const snap = await adminDb().collection("users").doc(user.uid).get();
  const granted = snap.data()?.researchConsent?.granted === true;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Hồ sơ và quyền riêng tư</h1>
      <ResearchConsentForm uid={user.uid} initialGranted={granted} />
      <DeleteAccountSection uid={user.uid} />
    </main>
  );
}
