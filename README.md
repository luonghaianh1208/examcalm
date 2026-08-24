This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Lớp phản chiếu AI (Spec #3)

ExamCalm có một tính năng tuỳ chọn dùng AI để tạo "phản chiếu" sau khi học sinh ghi nhật ký
cảm xúc, cắm được vào bất kỳ dịch vụ nào tương thích chuẩn OpenAI. Mặc định tính năng này
TẮT hoàn toàn (chưa cấu hình provider, kill switch đang chặn) cho tới khi một admin bật thủ
công. Xem:

- [docs/ai-provider-setup.md](./docs/ai-provider-setup.md) — cách đặt/xoay API key, ví dụ
  cấu hình cho vài provider phổ biến, cách "Thử kết nối", và cách tắt khẩn cấp.
- [docs/ai-go-live-checklist.md](./docs/ai-go-live-checklist.md) — danh sách kiểm tra BẮT
  BUỘC một người phải xác nhận trước khi bật tính năng này cho học sinh thật.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
