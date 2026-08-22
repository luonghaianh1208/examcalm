import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/session-config";

/**
 * Chỉ kiểm tra CÓ cookie hay không — Edge runtime không chạy được firebase-admin.
 * Xác minh chữ ký và kiểm tra role làm ở Server Component layout (requireUser/requireAdmin).
 * Đây KHÔNG phải lớp bảo mật; Security Rules mới là lớp bảo mật.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/dang-nhap";
  url.searchParams.set("tiep-tuc", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/tien-trinh/:path*", "/nhat-ky/:path*", "/ho-so/:path*", "/admin/:path*"],
};
