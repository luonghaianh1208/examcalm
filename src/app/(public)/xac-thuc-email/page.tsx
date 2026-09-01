import { VerifyEmailNotice } from "@/components/auth/VerifyEmailNotice";

export const metadata = { title: "Xác thực email" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <h1 className="mb-4 text-2xl font-semibold">Kiểm tra hộp thư nhé</h1>
      <p className="mb-6 text-slate-600">
        Mình vừa gửi một email xác thực. Bấm vào link trong email rồi quay lại đây,
        bạn sẽ lưu được kết quả test và nhật ký cảm xúc.
      </p>
      <VerifyEmailNotice />
    </div>
  );
}
