import { requireUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { PersonalInfoSection } from "@/components/settings/PersonalInfoSection";
import { ResearchConsentForm } from "@/components/settings/ResearchConsentForm";
import { AiConsentSection } from "@/components/settings/AiConsentSection";
import { ReplayGuideSection } from "@/components/settings/ReplayGuideSection";
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

  // Document có thể thiếu field (tài khoản bootstrap ngoài app — xem
  // ensureUserProfile), nên mọi giá trị đều phải có đường lui.
  const data = snap.data();
  const examGoals = Array.isArray(data?.examGoals)
    ? data.examGoals.filter((g: unknown): g is string => typeof g === "string")
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Hồ sơ và quyền riêng tư</h1>
      <PersonalInfoSection
        email={user.email}
        nickname={typeof data?.nickname === "string" ? data.nickname : ""}
        gradeLevel={typeof data?.gradeLevel === "string" ? data.gradeLevel : ""}
        school={typeof data?.school === "string" ? data.school : ""}
        examGoals={examGoals}
      />
      <ResearchConsentForm uid={user.uid} initialGranted={granted} />
      <AiConsentSection
        uid={user.uid}
        initialAiOptIn={aiOptIn}
        initialAiConsentVersion={aiConsentVersion}
      />
      <ReplayGuideSection uid={user.uid} />
      <DeleteAccountSection uid={user.uid} />
    </div>
  );
}
