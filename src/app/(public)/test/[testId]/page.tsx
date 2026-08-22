import { notFound } from "next/navigation";
import { getPublishedTest } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { TestSession } from "@/components/test/TestSession";

// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const test = await getPublishedTest(testId);
  if (!test) notFound();

  const user = await getSessionUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">{test.title}</h1>
      <TestSession
        test={test}
        isSignedIn={Boolean(user)}
        canSave={Boolean(user?.emailVerified)}
      />
    </main>
  );
}
