import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata = { title: "Đăng ký" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Tạo tài khoản</h1>
      <p className="mb-6 text-slate-600">
        Có tài khoản, bạn lưu được kết quả test và nhật ký cảm xúc để xem lại thay đổi theo thời gian.
      </p>
      <SignUpForm />
    </main>
  );
}
