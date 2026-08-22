import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Đăng nhập · ExamCalm" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Đăng nhập</h1>
      <Suspense fallback={<p>Đang tải…</p>}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
