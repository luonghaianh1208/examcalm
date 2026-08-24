# Danh sách kiểm tra trước khi bật AI cho học sinh

**Dành cho ai:** thầy/cô phụ trách ExamCalm — không cần là dân kỹ thuật, không cần là luật
sư. Bạn chỉ cần đọc kỹ và làm đúng từng mục dưới đây, theo đúng thứ tự.

**Vì sao tài liệu này quan trọng:** ExamCalm mặc định ship ở trạng thái **im lặng hoàn
toàn** — chưa cấu hình provider nào, và học sinh mặc định CHƯA đồng ý dùng AI. Hệ thống
được cố tình thiết kế như vậy, vì đây là ghi chú cảm xúc riêng tư của học sinh vị thành niên
— một khi bạn bật, ghi chú đó sẽ được gửi ra một dịch vụ AI bên ngoài trường. Danh sách này
là **cổng chặn cuối cùng do con người xác nhận**, không phải thủ tục giấy tờ.

> ## QUY TẮC DUY NHẤT KHÔNG ĐƯỢC PHÁ VỠ
> **Chưa tick đủ TẤT CẢ các mục dưới đây thì KHÔNG đặt `baseUrl` trên production** (tức
> không hoàn tất mục 5 ở [docs/ai-provider-setup.md](./ai-provider-setup.md) trên project
> `examcalm` thật). Bạn có thể thử nghiệm thoải mái trên Firebase Emulator hoặc một project
> dev riêng — quy tắc này chỉ áp dụng cho production, nơi học sinh thật đang dùng.

---

## ☐ 1. Chọn provider và đọc điều khoản dữ liệu của họ

Tìm trang chính sách/điều khoản dùng dữ liệu của provider — thường có tên như "Data Usage
Policy", "API Data Privacy", "Enterprise Privacy Policy", hoặc nằm trong "Terms of Service"
mục nói riêng về API (khác với điều khoản cho sản phẩm tiêu dùng/app di động của cùng công
ty — hai thứ này thường KHÁC NHAU). Link thường nằm ở chân trang web của provider, hoặc
trong trang tài liệu API (docs) của họ.

Đọc kỹ trước khi qua mục 2 — mục đó sẽ dùng đúng trang này.

## ☐ 2. Xác nhận đã tắt "lưu dữ liệu để huấn luyện" (data retention for training)

Đây là mục **khó nhất và quan trọng nhất** trong toàn bộ danh sách. Làm theo đúng các bước
cụ thể sau — đừng chỉ "đọc điều khoản rồi tự đánh giá":

1. Ở trang chính sách đã tìm thấy ở mục 1, dùng chức năng tìm trong trang (Ctrl+F trên
   Windows, Cmd+F trên Mac) và gõ từ khoá **"train"** (hoặc "training", "cải thiện mô
   hình", "improve the model"). Đọc kỹ CẢ CÂU chứa từ đó, không chỉ đọc từ khoá.
2. Vào trang **quản lý tài khoản (dashboard)** của provider — không phải trang chính sách,
   mà là nơi bạn đăng nhập để quản lý API key. Tìm mục **Settings** (Cài đặt) → tìm phần có
   tên gần giống **"Data Controls"**, **"Privacy"**, **"Data Sharing"**, hoặc
   **"Model training"**. Nhiều provider có hẳn một CÔNG TẮC ở đây — nếu có, công tắc đó
   PHẢI đang ở trạng thái TẮT (không cho phép dùng dữ liệu của bạn để huấn luyện).
3. Nếu bạn **không tìm thấy công tắc nào**, và trang chính sách ở bước 1 **không nói rõ
   ràng bằng câu chữ tường minh** rằng dữ liệu gửi qua API KHÔNG được dùng để huấn luyện
   theo mặc định — coi như câu trả lời là "CÓ, họ dùng để huấn luyện". Không đoán theo
   hướng có lợi cho provider.
4. Việc phải chắc chắn 100%, không phải "gần chắc chắn": nếu điều khoản viết mập mờ, viết
   bằng ngôn ngữ bạn không đọc được rõ, hoặc bạn phải liên hệ hỗ trợ để hỏi mà không nhận
   được câu trả lời rõ ràng bằng văn bản — coi như CHƯA đạt yêu cầu của mục này.

**Nếu provider bạn chọn KHÔNG cho tắt việc này** (không có công tắc, và chính sách không
cam kết rõ ràng bằng văn bản) — **câu trả lời là chọn một provider khác.** Không có ngoại
lệ, không "tạm chấp nhận rồi tính sau". Đây là ghi chú cảm xúc của trẻ vị thành niên.

## ☐ 3. Ghi `providerLabel` đúng tên nhà cung cấp THẬT

Ở `/admin/ai`, ô "Tên nhà cung cấp" phải ghi đúng tên công ty đứng sau dịch vụ bạn chọn (vd:
"OpenAI", không phải "AI" hay một biệt danh nội bộ nào khác). Tên này hiển thị THẲNG cho học
sinh ở màn hình đồng ý — các em có quyền biết chính xác ghi chú của mình đi tới công ty nào.

## ☐ 4. Quyết định có cần thông báo phụ huynh

Đây là dữ liệu sức khoẻ tinh thần của trẻ vị thành niên được gửi ra một dịch vụ bên ngoài
trường. Trao đổi với ban giám hiệu/người phụ trách đạo đức nghiên cứu của trường (nếu có) về
việc có cần gửi thông báo cho phụ huynh trước khi bật tính năng này hay không, và nếu có,
soạn nội dung thông báo đó **trước** khi qua mục 8.

## ☐ 5. Đặt `quotaStudentPerDay` thấp cho tuần đầu

Đề xuất: **5** lượt/học sinh/ngày cho tuần đầu tiên sau khi bật. Vào `/admin/ai`, điền số
này vào ô "Quota mỗi học sinh mỗi ngày", lưu lại. Sau một tuần theo dõi không có vấn đề gì
bất thường (chi phí, nội dung trả về...), có thể cân nhắc nâng dần lên.

## ☐ 6. Xác nhận cảnh báo ngân sách (budget alert) trong Cloud Billing đang hoạt động

Vào [Google Cloud Console](https://console.cloud.google.com/billing) → chọn đúng billing
account gắn với project `examcalm` → mục **Budgets & alerts** (Ngân sách và cảnh báo) →
xác nhận đã có ít nhất một ngân sách (budget) được tạo cho project này, với ít nhất một
ngưỡng cảnh báo (vd: 50%, 90%, 100%) gửi email tới địa chỉ bạn thực sự theo dõi. Nếu chưa có,
tạo một cái trước khi qua mục tiếp theo — đây là lưới an toàn khi có gì đó gọi AI quá nhiều
(lỗi phần mềm, hoặc lạm dụng) mà không ai nhận ra kịp thời.

## ☐ 7. Bật kill switch rồi tắt xuống một lần trên production, xác nhận nó thật sự chặn

"Kill switch" chính là ô tick **"Bật tính năng phản chiếu AI cho học sinh"** ở `/admin/ai`
(tick = tính năng đang BẬT; bỏ tick = kill switch đang chặn, tính năng TẮT). Làm đúng thứ tự
sau, trên project production thật (`examcalm`), không phải trên emulator:

1. Đảm bảo ô đó đang **bỏ tick** (tính năng tắt), bấm "Lưu cấu hình".
2. Dùng một tài khoản học sinh thử (của chính bạn hoặc tài khoản test), thử ghi một nhật ký
   cảm xúc — xác nhận **không có** thẻ phản chiếu AI nào xuất hiện, và ở trang Hồ sơ, phần
   AI báo "chưa khả dụng" hoặc không cho bật đồng ý.
3. Tick lại ô đó (tính năng bật), bấm "Lưu cấu hình".
4. Xác nhận tính năng hoạt động trở lại bình thường với tài khoản thử ở bước 2.

Mục đích: chứng minh rằng nếu sau này bạn cần TẮT KHẨN CẤP (xem mục 4 của
docs/ai-provider-setup.md), công tắc đó thật sự có tác dụng trên production — không phải chỉ
tin là nó hoạt động.

## ☐ 8. Nhờ một chuyên gia tâm lý đọc `systemPrompt` trước khi publish template

Trước khi bấm "Đăng" (publish) bất kỳ prompt template nào ở `/admin/ai`, gửi nguyên văn nội
dung ô **"System prompt"** (và "User template") cho một chuyên gia tâm lý học đường (hoặc
tương đương) đọc và góp ý — đây là đoạn văn bản định hình CÁCH mà "phản chiếu" của AI nói
chuyện với học sinh đang căng thẳng trước kỳ thi. Chỉ publish sau khi người đó xác nhận nội
dung ổn. Sửa lại một bản ĐANG published sẽ bị hệ thống chặn (phải gỡ đăng trước) — đúng để
ép quy trình này luôn diễn ra trước khi có thay đổi tới tay học sinh.

---

## Tick xong cả 8 mục?

Quay lại [docs/ai-provider-setup.md](./ai-provider-setup.md) mục 5 để điền `baseUrl` +
`model` thật trên production, rồi bấm "Thử kết nối" một lần cuối trước khi công bố cho học
sinh biết tính năng đã sẵn sàng.
