import type { Metadata } from "next";
import { Be_Vietnam_Pro, Nunito } from "next/font/google";
import { getSessionUser } from "@/lib/firebase/session";
import { MoodWidget } from "@/components/mascot/MoodWidget";
import { FirebaseBootstrap } from "@/components/FirebaseBootstrap";
import { OnboardingController } from "@/components/onboarding/OnboardingController";
import "./globals.css";

/*
 * Brand Guideline v1.1, trang 09: Be Vietnam Pro cho toàn bộ giao diện; Nunito
 * CHỈ dành cho lời thoại ngắn của Meo.
 *
 * subset "vietnamese" là bắt buộc, không phải tuỳ chọn: thiếu nó thì mọi chữ
 * có dấu rơi về font dự phòng của hệ điều hành, chữ trong cùng một câu sẽ lệch
 * kiểu — lỗi này chỉ lộ ra với người đọc tiếng Việt.
 *
 * Be Vietnam Pro cần khai báo weight vì đây không phải font biến thiên.
 * 400/500/600/700 khớp đúng thang chữ của guideline.
 */
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · ExamCalm",
    default: "ExamCalm — Bình tĩnh trước kỳ thi",
  },
  description:
    "Công cụ tự tìm hiểu cảm xúc dành cho học sinh THPT: bài test tham khảo, nhật ký cảm xúc và thư viện kỹ thuật thư giãn.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();

  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${nunito.variable} h-full antialiased`}
    >
      {/* Vỏ app (sidebar, logo, bottom nav, footer) do layout của TỪNG route
          group dựng — xem AppShell. Đặt ở đây thì trang quản trị sẽ lồng hai vỏ
          vào nhau, vì mọi route đều đi qua layout gốc này.
          Nền và màu chữ mặc định do brand-tokens.css lo. */}
      <body className="min-h-full font-sans">
        <FirebaseBootstrap />
        {children}
        <MoodWidget uid={user?.uid ?? null} canSave={Boolean(user?.emailVerified)} />
        <OnboardingController user={user} />
      </body>
    </html>
  );
}
