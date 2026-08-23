import { requireUser } from "@/lib/firebase/session";
import { listPublishedResources } from "@/lib/firebase/queries-public";
import { SavedResourceList } from "@/components/library/SavedResourceList";

export const metadata = { title: "Đã lưu" };

export default async function Page() {
  const user = await requireUser();
  const all = await listPublishedResources({ includeStudentOnly: true, limit: 200 });
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Bài đã lưu</h1>
      <SavedResourceList uid={user.uid} allResources={all} />
    </main>
  );
}
