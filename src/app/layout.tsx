import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSessionUser } from "@/lib/firebase/session";
import { MoodWidget } from "@/components/mascot/MoodWidget";
import { FirebaseBootstrap } from "@/components/FirebaseBootstrap";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FirebaseBootstrap />
        <SiteHeader user={user} />
        {children}
        <SiteFooter />
        <MoodWidget uid={user?.uid ?? null} canSave={Boolean(user?.emailVerified)} />
      </body>
    </html>
  );
}
