import { requireUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { ResearchConsentForm } from "@/components/settings/ResearchConsentForm";
import { AiConsentSection } from "@/components/settings/AiConsentSection";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";

export const metadata = { title: "Hồ sơ" };

export default async function Page() {
  const user = await requireUser();
  const snap = await adminDb().collection("users").doc(user.uid).get();
  const granted = snap.data()?.researchConsent?.granted === true;
  const aiOptIn = snap.data()?.privacySettings?.aiOptIn === true;
  // I4 (final whole-branch review): field vắng mặt (đồng ý từ trước khi field này tồn tại,
  // hoặc chưa từng đồng ý) -> null, coi như version cũ — xem hasCurrentAiConsent.
  const rawAiConsentVersion = snap.data()?.privacySettings?.aiConsentVersion;
  const aiConsentVersion = typeof rawAiConsentVersion === "number" ? rawAiConsentVersion : null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">Hồ sơ và quyền riêng tư</h1>
      <ResearchConsentForm uid={user.uid} initialGranted={granted} />
      <AiConsentSection
        uid={user.uid}
        initialAiOptIn={aiOptIn}
        initialAiConsentVersion={aiConsentVersion}
      />
      <DeleteAccountSection uid={user.uid} />
    </div>
  );
}
