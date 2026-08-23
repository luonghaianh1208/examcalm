import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 chặn mặc định mọi request cross-origin tới tài nguyên dev (_next/*)
  // trừ khi origin nằm trong allowlist — mặc định chỉ "localhost" được tin.
  // Playwright E2E cố tình trỏ vào 127.0.0.1 (không phải "localhost") để tránh
  // lỗi phân giải IPv6 (::1) hay gặp trên CI, nên cần khai báo rõ ở đây; không
  // ảnh hưởng production vì cơ chế này chỉ áp dụng cho `next dev`.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
