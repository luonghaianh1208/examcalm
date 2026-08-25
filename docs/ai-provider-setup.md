# Cắm một AI provider vào ExamCalm

Tài liệu này dành cho người **quản trị** ExamCalm (thầy/cô phụ trách, không cần biết lập
trình) — hướng dẫn cắm một dịch vụ AI thật vào tính năng "Phản chiếu AI" sau khi ghi cảm xúc.
Nếu bạn chưa làm việc này bao giờ, cứ đọc từ trên xuống, làm theo đúng thứ tự.

Mặc định khi mới cài đặt, tính năng này **hoàn toàn im lặng**: chưa có provider nào được
cấu hình, và công tắc an toàn ("kill switch") đang ở trạng thái TẮT tính năng. Học sinh
không thấy gì cả cho tới khi bạn làm xong các bước dưới đây **và** hoàn thành
[danh sách kiểm tra trước khi bật](./ai-go-live-checklist.md).

## 1. Việc cần chuẩn bị trước

- Máy tính đã cài [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g
  firebase-tools`) và đã đăng nhập (`firebase login`) bằng tài khoản Google có quyền trên
  project Firebase của ExamCalm (tên project: `examcalm`).
- Một tài khoản ở một dịch vụ AI tương thích OpenAI (xem mục 4 để chọn), và **API key** của
  dịch vụ đó — một chuỗi ký tự bí mật do dịch vụ cấp cho bạn, dùng để họ tính tiền và xác
  thực request.
- Quyền quản trị (admin) trong ExamCalm — để vào được trang `/admin/ai`.

**Tuyệt đối không** dán API key vào bất kỳ ô nhập liệu nào trong trang quản trị ExamCalm —
trang đó không có ô nào để nhập key cả, vì lý do an toàn: key chỉ được đặt qua dòng lệnh ở
bước 2, và không bao giờ đi qua trình duyệt hay hiển thị lại cho ai xem.

## 2. Đặt API key (secret)

API key được lưu trong **Secret Manager** của Google Cloud, tách biệt hoàn toàn khỏi trang
quản trị và khỏi mã nguồn — cách duy nhất để đặt hoặc đổi key là chạy lệnh này trên máy
tính (thay `YOUR_API_KEY` bằng key thật của bạn khi được hỏi, KHÔNG gõ thẳng key vào dòng
lệnh — lệnh dưới đây sẽ tự hỏi lại, dán key vào đó):

```bash
firebase functions:secrets:set EXAMCALM_AI_API_KEY --project examcalm
```

Lệnh sẽ hỏi lại "Enter a value for EXAMCALM_AI_API_KEY" — dán API key vào, nhấn Enter. Chỉ
vậy thôi, không có bước nào khác cho lần đặt đầu tiên.

Nếu đây là lần **đầu tiên** đặt key này (project chưa từng deploy Cloud Functions có dùng
secret này), cần deploy Cloud Functions một lần để hệ thống thực sự nạp giá trị mới:

```bash
firebase deploy --only functions --project examcalm
```

## 3. Xoay (đổi) key định kỳ, hoặc khi nghi ngờ lộ

Nên đổi key định kỳ (vài tháng một lần) như một thói quen an toàn tốt, và đổi **ngay lập
tức** nếu nghi ngờ key đã lộ ra ngoài (vd: dán nhầm vào một chỗ công khai, máy tính bị mất).

Các bước xoay key:

1. Vào trang quản lý của dịch vụ AI (dashboard của provider), tạo một API key **mới**.
2. Chạy lại đúng lệnh ở mục 2 với key mới:
   ```bash
   firebase functions:secrets:set EXAMCALM_AI_API_KEY --project examcalm
   ```
3. Deploy lại Cloud Functions để hệ thống dùng key mới:
   ```bash
   firebase deploy --only functions --project examcalm
   ```
4. Vào `/admin/ai`, bấm **"Thử kết nối"** (xem mục 5) để xác nhận key mới hoạt động.
5. Sau khi chắc chắn key mới đã chạy tốt, quay lại dashboard của provider, **xoá (revoke)
   key cũ** — đây là bước thu hồi thật sự, không phải chỉ đổi ở phía ExamCalm.

**Lưu ý quan trọng:** đổi key ở bước 2–3 không tự động tắt tính năng — nếu bạn đang xoay key
vì lý do khẩn cấp (nghi ngờ ai đó đang lạm dụng key cũ ngay lúc này), hãy làm bước 4 ở mục
kế tiếp TRƯỚC, rồi mới xoay key theo đúng trình tự.

## 4. Tắt khẩn cấp — nhanh hơn xoay key

Nếu cần dừng tính năng **ngay lập tức** (nghi ngờ lạm dụng, chi phí tăng bất thường, nội
dung AI trả về có vấn đề...), đừng đợi xoay key — việc đó cần deploy lại, mất vài phút. Có
hai cách nhanh hơn nhiều:

- **Nhanh nhất — công tắc kill switch:** vào `/admin/ai`, bỏ tick ô **"Bật tính năng phản
  chiếu AI cho học sinh"**, bấm **"Lưu cấu hình"**. Có hiệu lực gần như ngay lập tức (không
  cần deploy) — mọi lượt **phản chiếu AI** (tính năng học sinh dùng, tốn quota) mới sẽ bị
  chặn, nhật ký cảm xúc của học sinh vẫn lưu bình thường, không mất gì. Riêng nút **"Thử kết
  nối"** ở mục 6 (chỉ admin dùng để kiểm tra cấu hình, không tốn quota học sinh) KHÔNG bị kill
  switch chặn — đây là điều có chủ đích, để admin vẫn thử được cấu hình trong lúc tính năng
  đang tắt cho học sinh.
  - **Tính năng Trò chuyện có công tắc RIÊNG, TÁCH BIỆT hoàn toàn** — ô **"Bật tính năng trò
    chuyện AI cho học sinh"**, ngay bên dưới ô phản chiếu ở cùng trang. Tắt công tắc phản chiếu
    KHÔNG tự động tắt trò chuyện, và ngược lại — nếu bạn cần dừng khẩn cấp, kiểm tra và bỏ tick
    CẢ HAI ô nếu không chắc vấn đề nằm ở tính năng nào.
- **Nếu nghi ngờ chính API key đã bị lộ/lạm dụng:** vào thẳng dashboard của provider, **thu
  hồi (revoke) API key đó tại đó** — cách này chặn được cả những request không đi qua
  ExamCalm (vd: key bị dùng ở nơi khác). Sau đó tạo key mới và làm lại theo mục 3.

Kill switch chặn học sinh gọi tính năng; thu hồi key ở provider chặn chính API key đó hoạt
động ở bất kỳ đâu. Khi không chắc, làm **cả hai**.

## 5. Điền cấu hình và ví dụ cho vài provider phổ biến

Vào `/admin/ai`, điền các ô sau (tất cả trừ API key — API key đã đặt xong ở mục 2):

| Trường | Ý nghĩa |
|---|---|
| Tên nhà cung cấp | Tên THẬT của provider, hiển thị cho học sinh ở màn hình đồng ý (vd: "OpenAI"). Xem yêu cầu bắt buộc ở [checklist go-live](./ai-go-live-checklist.md). |
| Base URL | Địa chỉ API của provider, xem bảng ví dụ dưới đây. |
| Model | Tên model cụ thể của provider đó. |

Ba ví dụ `baseUrl` + `model` cho các dịch vụ tương thích chuẩn OpenAI (API "chat
completions") phổ biến — kiểm tra lại trên trang tài liệu chính thức của provider trước khi
dùng, vì tên model có thể thay đổi theo thời gian:

| Provider | Base URL | Model (ví dụ) |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Ollama (tự host trên máy chủ nội bộ, không qua Internet) | `http://localhost:11434/v1` hoặc `http://127.0.0.1:11434/v1` | tên model đã `ollama pull` về (vd: `llama3.1`) |

Lưu ý về Base URL: hệ thống **bắt buộc** `https://` cho mọi địa chỉ trên Internet — chỉ chấp
nhận `http://` (không mã hoá) cho `localhost`/`127.0.0.1`, tức máy chủ chạy ngay trong mạng
nội bộ của trường (như Ollama tự host). Đây là quy tắc để ghi chú cảm xúc của học sinh không
bao giờ đi qua một kết nối không mã hoá ra Internet.

Sau khi điền xong, bấm **"Lưu cấu hình"**.

## 6. "Thử kết nối"

Sau khi lưu cấu hình, bấm nút **"Thử kết nối"** ở cùng trang `/admin/ai`. Nút này gửi một
yêu cầu THỬ rất ngắn, cố định, tới đúng provider/model bạn vừa lưu — **không** dùng ghi chú
cảm xúc thật của học sinh nào, và **không** trừ vào lượt (quota) của học sinh nào.

- Thấy **"Kết nối thành công."** — provider đã sẵn sàng phục vụ. Vẫn chưa hiện gì với học
  sinh cho tới khi bạn tick "Bật tính năng" ở mục 4 và hoàn thành checklist go-live.
- Thấy thông báo lỗi — đọc đúng nội dung câu báo lỗi (vd: "kiểm tra lại API key", "kiểm tra
  lại baseUrl và model") và kiểm tra lại đúng chỗ được chỉ ra. Câu báo lỗi cố tình không nói
  chi tiết kỹ thuật (không lộ baseUrl/key thật) — nếu vẫn không rõ vì sao lỗi, kiểm tra lại
  từng bước ở mục 2 và mục 5.

Nút "Thử kết nối" luôn kiểm tra cấu hình **đã lưu**, không phải các ô đang gõ dở chưa bấm
"Lưu cấu hình" — nếu vừa sửa gì đó, lưu lại trước khi bấm thử.

## 7. Cắm dịch vụ gửi mail cảnh báo khủng hoảng (Resend)

Đây là một dịch vụ **khác hoàn toàn** với dịch vụ AI ở các mục 1–6 phía trên — không dùng
chung API key, không dùng chung tài khoản. Mục này chỉ liên quan tới việc **gửi email cho
admin** khi hệ thống phát hiện một học sinh có dấu hiệu tự hại (ExamCalm dùng
[Resend](https://resend.com) để gửi mail này). Nếu bạn chưa bật tính năng Trò chuyện (chat) —
tính năng duy nhất tạo ra cảnh báo khủng hoảng — có thể bỏ qua mục này cho tới khi cần.

### 7.1. Tạo tài khoản Resend và lấy API key

1. Đăng ký tài khoản tại [resend.com](https://resend.com).
2. **Xác minh (verify) một domain gửi mail** trong dashboard Resend — Resend không cho gửi mail
   từ một địa chỉ thuộc domain chưa xác minh (thêm bản ghi DNS theo hướng dẫn của Resend cho
   domain trường bạn, vd `truong-ban.edu.vn`).
3. Vào **API Keys** trong dashboard, tạo một key mới, sao chép lại (Resend chỉ hiện key này
   **một lần duy nhất**).

### 7.2. Đặt secret bằng CLI

Giống hệt cách đặt key AI provider ở mục 2, nhưng dùng **tên secret khác**:

```bash
firebase functions:secrets:set EXAMCALM_RESEND_API_KEY --project examcalm
```

Dán API key Resend vào khi được hỏi, nhấn Enter. Nếu đây là lần đầu đặt secret này, deploy lại
Cloud Functions để hệ thống nạp giá trị mới:

```bash
firebase deploy --only functions --project examcalm
```

**Tuyệt đối không** có ô nhập nào cho key này ở trang `/admin/ai` — cùng lý do với key AI
provider ở mục 1: key chỉ đi qua dòng lệnh, không bao giờ qua trình duyệt.

### 7.3. Điền địa chỉ gửi — PHẢI là hộp thư có người thật kiểm tra

Ở `/admin/ai`, ô **"Email gửi cảnh báo khủng hoảng cho admin"** đóng vai trò **CẢ người gửi lẫn
người nhận** — mọi mail cảnh báo đều gửi TỚI chính địa chỉ này (admin nhận bản sao qua bcc).
**Đừng dùng một địa chỉ no-reply không có ai đọc.** Nếu địa chỉ đó không có hộp thư nhận thật,
mọi lượt gửi đều bị trả lại (bounce), và một tỉ lệ bounce cao kéo dài là lý do Resend **khoá
hoặc đình chỉ tài khoản gửi mail** — lúc đó cả đường gửi cảnh báo khủng hoảng ngừng hoạt động,
kể cả bản bcc mà admin đáng lẽ nhận được. Dùng một địa chỉ thuộc domain đã xác minh ở bước 7.1
mà có người thật kiểm tra định kỳ (vd `canh-bao@truong-ban.edu.vn`, hộp thư dùng chung của tổ tư
vấn học đường).

Sau khi điền, tick **"Bật gửi mail cảnh báo khủng hoảng cho mọi admin"**, bấm **"Lưu cấu
hình"**.

### 7.4. Xoay (đổi) key Resend

Cùng quy trình với mục 3 (đổi key AI provider), chỉ khác tên secret:

1. Tạo key mới trong dashboard Resend.
2. `firebase functions:secrets:set EXAMCALM_RESEND_API_KEY --project examcalm` với key mới.
3. `firebase deploy --only functions --project examcalm`.
4. Xác nhận hoạt động (xem mục 7.5 — gửi một cảnh báo thử).
5. Thu hồi (revoke) key cũ trong dashboard Resend.

### 7.5. Tắt khẩn cấp

Nếu cần dừng việc gửi mail cảnh báo **ngay lập tức** (chi phí bất thường, nghi ngờ key bị lộ,
Resend báo tài khoản gặp vấn đề...):

- **Nhanh nhất:** vào `/admin/ai`, bỏ tick **"Bật gửi mail cảnh báo khủng hoảng cho mọi admin"**,
  bấm "Lưu cấu hình". Có hiệu lực gần như ngay lập tức, không cần deploy — cảnh báo khủng hoảng
  **vẫn được ghi vào hệ thống bình thường** (trang `/admin/canh-bao` vẫn hiện đầy đủ), chỉ riêng
  bước gửi email bị tắt. **Vì vậy khi tắt mail, phải có người kiểm tra trang cảnh báo thủ công
  thường xuyên hơn** cho tới khi bật lại — xem mục 9 của
  [checklist go-live](./ai-go-live-checklist.md).
- **Nếu nghi ngờ chính key Resend đã lộ:** vào thẳng dashboard Resend, thu hồi (revoke) key đó,
  rồi làm lại theo mục 7.4 với key mới.

Kill switch chặn việc GỬI mail; thu hồi key ở Resend chặn chính key đó hoạt động ở bất kỳ đâu.
Khi không chắc, làm **cả hai**.

## 8. Trước khi bật thật cho học sinh

Cắm xong provider và "Thử kết nối" thành công **chưa có nghĩa là được bật cho học sinh**.
Đây là dữ liệu sức khoẻ tinh thần của trẻ vị thành niên — còn một danh sách việc con người
phải tự tay xác nhận trước khi đặt `baseUrl` trên production, xem đầy đủ tại:

**[docs/ai-go-live-checklist.md](./ai-go-live-checklist.md)**
