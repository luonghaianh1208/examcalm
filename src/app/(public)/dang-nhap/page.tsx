import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Đăng nhập" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <h1 className="mb-6 text-2xl font-semibold">Đăng nhập</h1>
      <Suspense fallback={<p>Đang tải…</p>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
