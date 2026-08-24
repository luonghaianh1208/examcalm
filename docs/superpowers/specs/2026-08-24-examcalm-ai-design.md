# ExamCalm Spec #3 — AI Layer (provider tuỳ chỉnh, OpenAI-compatible)

**Ngày:** 2026-08-24
**PRD:** §7.2.3, §8
**Phụ thuộc:** Spec #1 (nền tảng), Spec #2 (CBT — không bắt buộc nhưng đã xong)
**Thay thế:** mục "Spec #3 — AI Layer (Genkit)" trong roadmap ngày 2026-08-23

---

## 1. Thay đổi lớn so với roadmap

Roadmap cũ đề xuất **Genkit + Vertex AI/Gemini**. Chủ sản phẩm chọn hướng khác: **API tương thích OpenAI, provider cấu hình được lúc chạy**.

Ba lý do khiến đây là lựa chọn đúng cho dự án này:

| | |
|---|---|
| **Chi phí** | DeepSeek, Groq, OpenRouter rẻ hơn Vertex đáng kể; một số có free tier thật. Đây là dự án học sinh, không có ngân sách vận hành. |
| **Không khoá nhà cung cấp** | Đổi provider = đổi `baseUrl` + `model` trong Admin console. Không sửa code, không deploy lại. |
| **Chạy được model nội bộ** | Nếu sau này trường có máy, cắm Ollama/LM Studio vào cùng một giao diện. |

Đổi lại, nó đẩy một câu hỏi lên hàng đầu — xem §3.

---

## 2. Phạm vi

### Có trong spec này

- Lớp client OpenAI-compatible (`chat/completions`) chạy trong Cloud Functions
- `systemConfig/aiConfig`: `baseUrl`, `model`, quota, rate limit, kill switch từng tính năng
- API key nằm trong **Secret Manager**, không nằm trong Firestore
- `moodReflectionFlow`: từ một `moodLog` sinh ra phản chiếu 2–4 câu + câu chuyện của mèo + một câu gợi ý viết tiếp
- `aiJournalOutputs` — chỉ Cloud Function ghi, client chỉ đọc của chính mình
- `promptTemplates` versioned + Admin UI sửa và thử prompt trước khi publish
- Kill switch tắt riêng từng tính năng, có test chứng minh nó thật sự chặn
- Hậu xử lý chặn ngôn ngữ chẩn đoán
- Admin console: cấu hình provider, thử kết nối, xem quota đã dùng

### KHÔNG có trong spec này — và vì sao

| Bỏ ra | Lý do |
|---|---|
| **AI cho Guest** (PRD §7.1.1) | Cần Anonymous Auth + `guestQuota` + chống lạm dụng theo IP. Đó là bề mặt tấn công và chi phí lớn nhất trong toàn bộ tính năng AI, đổi lấy giá trị nhỏ nhất. Học sinh đăng ký rồi mới có AI. Để lại Spec #3b nếu thật sự cần. |
| **`storyGenerationFlow` tách riêng** | Câu chuyện của mèo sinh chung một lần gọi với phản chiếu. Hai lần gọi model cho một lần check-in là gấp đôi chi phí không có lý do. |
| **Weekly/Monthly Reflection** | Thuộc Dashboard (Spec #6), cần dữ liệu tích luỹ. |
| **Genkit** | Không dùng. Nó là abstraction cho hệ sinh thái Google; ở đây chỉ cần một lời gọi HTTP tới `chat/completions`. Thêm Genkit là thêm một lớp phụ thuộc không mang lại gì. |

---

## 3. Câu hỏi an toàn dữ liệu — quan trọng hơn mọi thứ kỹ thuật ở đây

**Ghi chú cảm xúc của học sinh vị thành niên sẽ được gửi tới server của bên thứ ba.**

Với Vertex AI, ít nhất có điều khoản doanh nghiệp của Google và mặc định không dùng dữ liệu khách hàng để huấn luyện. Với một endpoint tuỳ ý, điều đó **phụ thuộc hoàn toàn vào nhà cung cấp** — và một số nơi mặc định **có** dùng dữ liệu người dùng để train.

Vì provider chưa chốt, spec này đặt ra các rào chắn không phụ thuộc provider:

### 3.1. Mặc định TẮT, người dùng phải tự bật

`privacySettings.aiOptIn` đã có sẵn trong schema từ Spec #1 và **chưa từng được đọc ở đâu**. Spec này là chỗ nó bắt đầu có ý nghĩa.

- Mặc định `false`. Không bật thì **không một ký tự nào** của học sinh rời khỏi Firestore.
- Màn hình bật phải nói **thẳng và cụ thể**: ghi chú sẽ được gửi tới một dịch vụ AI bên ngoài để tạo phản hồi; ai vận hành dịch vụ đó; và rằng em tắt lúc nào cũng được.
- Tắt lại thì các phản hồi AI cũ **bị xoá**, không chỉ ẩn đi.

### 3.2. Gửi ít nhất có thể

Chỉ gửi: `moodScore`, `moodIcon`, `note`, `tags`, `context`.

**Không bao giờ gửi:** `uid`, biệt danh, trường, lớp, email, hay bất kỳ định danh nào. Model không cần biết em là ai để nói một câu tử tế.

Xây dựng payload bằng **danh sách trường tường minh**, không spread — cùng lý do đã làm sập production ở Spec #1.

### 3.3. Nói thật với học sinh về provider

Admin console cho phép đổi `baseUrl` bất cứ lúc nào. Nghĩa là **nơi dữ liệu được gửi tới có thể đổi mà học sinh không biết**.

Rào chắn: `aiConfig` mang thêm trường `providerLabel` — tên hiển thị của nhà cung cấp — và màn hình đồng ý hiển thị đúng nhãn đó. Đổi provider thì nhãn đổi theo. Không hoàn hảo, nhưng ít nhất câu chữ không nói dối.

### 3.4. Việc con người phải làm trước khi bật cho học sinh

- Đọc điều khoản dữ liệu của provider đã chọn, xác nhận **tắt data-retention-for-training**
- Quyết định có cần thông báo phụ huynh hay không — đây là dữ liệu sức khoẻ tinh thần của trẻ vị thành niên gửi ra ngoài

Spec này **code được** trước khi hai việc đó xong, vì `aiOptIn` mặc định tắt. Nhưng **không được bật cho học sinh** khi chưa xong.

---

## 4. Kiến trúc

```
Client (trình duyệt)
  │  saveMoodLog()  ──────────────────►  Firestore: moodLogs
  │                                         (luôn lưu được, KHÔNG phụ thuộc AI)
  │
  │  callGenerateReflection({ moodLogId })
  ▼
Cloud Function  generateReflection   (asia-southeast1)
  │
  ├─ kiểm kill switch  ──────────────►  systemConfig/aiConfig
  ├─ kiểm aiOptIn      ──────────────►  users/{uid}.privacySettings
  ├─ kiểm quota        ──────────────►  aiUsage/{uid}_{yyyy-mm-dd}
  ├─ đọc moodLog       ──────────────►  moodLogs/{id}   (Admin SDK)
  ├─ đọc prompt        ──────────────►  promptTemplates (status=published)
  │
  ├─ POST {baseUrl}/chat/completions   ◄── API key từ Secret Manager
  │      Authorization: Bearer <key>
  │
  ├─ hậu xử lý: chặn ngôn ngữ chẩn đoán
  └─ ghi              ──────────────►  aiJournalOutputs   (client KHÔNG ghi được)
```

**Điểm cốt lõi:** API key **không bao giờ** rời khỏi Cloud Function. Client không biết `baseUrl`, không biết key, chỉ gọi một callable.

### 4.1. Vì sao không gọi thẳng từ client

Vì key sẽ lộ ngay lập tức. Bất kỳ ai mở DevTools cũng thấy. Với endpoint OpenAI-compatible thì key lộ = ai cũng tiêu tiền của anh được.

---

## 5. Mô hình dữ liệu

### 5.1. `systemConfig/aiConfig` — admin đọc/ghi

```ts
{
  providerLabel: string,      // "DeepSeek", "OpenRouter", ... — hiện cho học sinh xem
  baseUrl: string,            // vd "https://api.deepseek.com/v1"
  model: string,              // vd "deepseek-chat"
  temperature: number,        // 0–1
  maxTokens: number,
  quotaStudentPerDay: number, // mặc định THẤP, vd 5
  rateLimitPerMinute: number,
  killSwitch: { moodReflection: boolean },
}
```

**Không chứa API key.** Key nằm ở Secret Manager tên `examcalm-ai-api-key`.

### 5.2. `aiUsage/{uid}_{yyyy-mm-dd}` — chỉ Cloud Function ghi

```ts
{ uid: string, date: string, count: number, updatedAt: Timestamp }
```

Khoá theo ngày để tự hết hạn về mặt logic, không cần job dọn.

### 5.3. `aiJournalOutputs/{outputId}` — client chỉ đọc của mình

```ts
{
  userId: string,
  moodLogId: string,
  reflectionText: string,     // 2–4 câu, ngôn ngữ phỏng đoán bắt buộc
  catStoryText: string,
  journalPrompt: string,
  promptTemplateId: string,
  promptVersion: number,
  providerLabel: string,      // ghi lại nhà nào sinh ra — để truy vết
  model: string,
  userFeedback: "helpful" | "not_helpful" | null,
  createdAt: Timestamp,
}
```

### 5.4. `promptTemplates/{templateId}` — admin đọc/ghi

```ts
{ name: "mood_reflection", version: number, status: "draft" | "published",
  systemPrompt: string, userTemplate: string, updatedBy: string, updatedAt: Timestamp }
```

---

## 6. Security Rules bổ sung

```js
match /aiJournalOutputs/{id} {
  allow read:   if isSignedIn() && resource.data.userId == request.auth.uid;
  allow update: if isSignedIn() && resource.data.userId == request.auth.uid
                && request.resource.data.userId == resource.data.userId
                && request.resource.data.reflectionText == resource.data.reflectionText;
  allow create, delete: if false;   // chỉ Cloud Function (Admin SDK)
}

match /aiUsage/{id}        { allow read, write: if false; }   // chỉ Cloud Function
match /systemConfig/{id}   { allow read, write: if isAdmin(); }
match /promptTemplates/{id}{ allow read, write: if isAdmin(); }
```

**Admin KHÔNG đọc được `aiJournalOutputs`** — cùng lý do không đọc được `moodLogs`: nó chứa phản chiếu về ghi chú riêng tư của học sinh.

`update` chỉ mở đúng một khe: học sinh bấm "hữu ích / không hữu ích". Ràng buộc `reflectionText` không đổi để không ai sửa được nội dung AI đã sinh — cùng bài học với lỗ hổng đổi `userId` ở `moodLogs`.

---

## 7. Ràng buộc đạo đức — là yêu cầu, không phải tuỳ chọn

1. **Mọi output AI gắn nhãn "Nội dung do AI tạo"**, hiển thị rõ, không giấu trong tooltip.
2. **Ngôn ngữ phỏng đoán bắt buộc** — "có vẻ", "từ những gì bạn chia sẻ". System prompt yêu cầu, và hậu xử lý kiểm lại.
3. **Hậu xử lý chặn ngôn ngữ chẩn đoán.** Nếu output chứa từ như "rối loạn", "trầm cảm", "bệnh", "chẩn đoán" → **không lưu, không hiện**, ghi log để admin xem. Thà không có phản chiếu còn hơn có một câu gán nhãn bệnh cho học sinh lớp 12.
4. **Mood log luôn lưu được kể cả khi AI hỏng.** AI là lớp phụ; hỏng thì học sinh vẫn ghi được nhật ký như thường, không thấy lỗi gì đáng sợ.
5. **Không streak, không nhắc nhở, không "hôm nay chưa check-in".**
6. **Học sinh xoá được** từng phản chiếu, và tắt `aiOptIn` thì xoá hết.

---

## 8. Chi phí và phanh

Đây là spec đầu tiên tốn tiền theo lượt dùng. Ba lớp phanh, tất cả phải chạy được **trước** khi bật cho học sinh:

| Phanh | Cơ chế |
|---|---|
| **Quota mỗi học sinh mỗi ngày** | `aiUsage`, mặc định **5 lượt**. Vượt thì báo nhẹ nhàng, không phải lỗi. |
| **Rate limit mỗi phút** | Chặn vòng lặp vô tình hoặc cố ý |
| **Kill switch** | Admin tắt trong một cú bấm, không cần deploy. **Phải có test chứng minh nó thật sự chặn lời gọi.** |

Cộng thêm `maxTokens` giới hạn để một lời gọi không thể tốn bất thường.

---

## 9. Rủi ro

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R1 | Provider dùng dữ liệu để train | `aiOptIn` mặc định tắt; con người phải xác nhận điều khoản trước khi bật |
| R2 | Model trả về ngôn ngữ chẩn đoán | Hậu xử lý chặn cứng, thà bỏ output còn hơn hiển thị |
| R3 | API key lộ | Chỉ nằm ở Secret Manager, chỉ Cloud Function đọc, không bao giờ tới client |
| R4 | Chi phí vượt kiểm soát | Quota + rate limit + kill switch + `maxTokens` |
| R5 | Provider đổi mà học sinh không biết | `providerLabel` hiển thị ở màn hình đồng ý |
| R6 | Endpoint không tương thích hoàn toàn | Lớp client chỉ dùng phần lõi của `chat/completions`; Admin console có nút "Thử kết nối" báo lỗi rõ ràng |

---

## 10. Việc con người phải chốt

| Mức | Việc |
|---|---|
| **Chặn bật cho học sinh** | Chọn provider, đọc điều khoản, xác nhận tắt data-retention-for-training |
| **Chặn bật cho học sinh** | Quyết định có cần thông báo phụ huynh |
| Không chặn code | Ngân sách tháng và quota mặc định |
| Không chặn code | Nội dung prompt — có thể sửa qua Admin console sau |
