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

## Lớp trò chuyện AI + đường xử lý khủng hoảng (Spec #4)

Mở rộng lớp AI ở trên: học sinh gõ chuyện trực tiếp với chú mèo đồng hành (không chỉ nhận một
lượt "phản chiếu" sau khi ghi cảm xúc), có bộ nhớ trong phạm vi cuộc trò chuyện, và có đường
phát hiện + báo cáo khi có dấu hiệu tự hại. Tính năng này có công tắc bật/tắt RIÊNG với "phản
chiếu" và thêm ba mục chặn go-live riêng — xem
[docs/ai-go-live-checklist.md](./docs/ai-go-live-checklist.md), phần "Trước khi bật riêng tính
năng Trò chuyện". Lý do mỗi từ khoá khủng hoảng được chọn nằm ở
[docs/crisis-keyword-rationale.md](./docs/crisis-keyword-rationale.md).

### Ghi chú khi triển khai (release notes)

- **`firestore:indexes` PHẢI deploy TRƯỚC `functions`.** `sendChatMessage` (Cloud Function xử lý
  mỗi tin nhắn) chạy hai truy vấn cần composite index — đọc lịch sử hội thoại
  (`chatMessages`, lọc theo `sessionId` + sắp theo `createdAt`) và tìm cảnh báo khủng hoảng chưa
  xử lý gần đây (`crisisAlerts`, lọc theo `userId` + `handledBy` + `createdAt`, xem
  `firestore.indexes.json`). Nếu deploy functions trước khi index build xong, **tin nhắn đầu
  tiên của học sinh — có thể đúng lúc là một tin nhắn khẩn cấp — có nguy cơ gặp lỗi** vì
  Firestore chưa có index để phục vụ truy vấn đó. Thứ tự deploy đúng:
  ```bash
  firebase deploy --only firestore:indexes --project examcalm
  # đợi Firebase Console báo index đã "Enabled" (không còn "Building") rồi mới chạy:
  firebase deploy --only functions --project examcalm
  ```
- **Khoá tài liệu `aiUsage` đã đổi hình dạng, làm mồ côi bộ đếm quota cũ.** Trước Spec #4, mỗi
  học sinh có một tài liệu đếm quota `aiUsage/{uid}_{yyyy-mm-dd}` dùng chung cho mọi tính năng
  AI. Từ Spec #4, khoá đổi thành `aiUsage/{uid}_{feature}_{yyyy-mm-dd}` (thêm `feature`, xem
  `functions/src/ai/quota.ts`) — để quota "phản chiếu" và quota "trò chuyện" không tiêu chung
  một ngân sách. Hệ quả: **các tài liệu `aiUsage` đã tạo TRƯỚC khi deploy Spec #4 sẽ không còn
  được tìm thấy bởi bất kỳ truy vấn nào theo khoá mới** — không mất dữ liệu (tài liệu cũ vẫn
  còn, vẫn bị xoá đúng khi xoá tài khoản vì `deleteUserData` lọc theo field `uid`, không theo
  id), nhưng học sinh đã dùng hết quota "phản chiếu" trong ngày TRƯỚC lúc deploy sẽ nhận lại một
  quota mới đầy đủ ngay sau khi deploy, dù chưa qua ngày mới theo giờ Việt Nam. Đây là hiệu ứng
  một lần, không lặp lại ở các lần deploy sau — không cần dọn tài liệu mồ côi, chúng vô hại.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
