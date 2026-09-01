import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Quên mật khẩu" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <h1 className="mb-4 text-2xl font-semibold">Quên mật khẩu</h1>
      <p className="mb-6 text-slate-600">
        Nhập email bạn dùng để đăng ký. Mình sẽ gửi cho bạn một link đặt lại mật khẩu.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
