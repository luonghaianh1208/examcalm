# ExamCalm Spec #4 — Chatbot có trí nhớ + đường xử lý khủng hoảng

**Ngày:** 2026-08-25
**PRD:** §7.2.3 (mở rộng), §8
**Phụ thuộc:** Spec #3 (lớp AI) — dùng lại gần như toàn bộ
**Quyết định của chủ sản phẩm:** trí nhớ **chỉ từ lịch sử chat**; khi có dấu hiệu tự hại thì **báo admin**

---

## 1. Vì sao spec này khác hẳn Spec #3

Spec #3 xây **phản chiếu một lượt**: học sinh ghi cảm xúc, AI viết lại vài câu, hết. Học sinh không hỏi nó được.

Spec #4 mở một ô để học sinh **gõ bất cứ điều gì**. Đó là thay đổi về bản chất, không phải về quy mô:

> Sẽ có em gõ vào ô đó câu mà em không dám nói với ai.

Mọi quyết định trong spec này xuất phát từ câu đó.

---

## 2. Phạm vi

### Có

- `chatSessions` + `chatMessages` — hội thoại lưu trong Firestore, chủ sở hữu đọc/xoá
- `sendChatMessage` callable: nạp N lượt gần nhất → dựng prompt → gọi provider → lọc an toàn → lưu
- **Phát hiện khủng hoảng hai lớp** (từ khoá + model), kích hoạt bởi một trong hai
- `crisisAlerts` — cảnh báo tới admin, **không chứa nguyên văn**
- Trang admin xem cảnh báo, đánh dấu đã xử lý
- Giao diện chat
- Quota tính theo **tin nhắn/ngày**, không phải lượt phản chiếu
- Sửa câu chữ đồng ý: nói rõ có cảnh báo tới thầy cô

### KHÔNG có — và vì sao

| Bỏ ra | Lý do |
|---|---|
| **Tóm tắt dài hạn do máy viết** | Chủ sản phẩm chọn "chỉ lịch sử chat". Một document máy viết mô tả tâm lý một đứa trẻ là thứ nhạy cảm nhất có thể tạo ra; không tạo nó thì không phải bảo vệ nó. |
| **AI đọc nhật ký cảm xúc / bài CBT** | Học sinh viết nhật ký với kỳ vọng nó riêng tư, không phải để đưa cho AI đọc. Ranh giới "AI chỉ biết những gì em nói VỚI NÓ" giải thích được cho một em 17 tuổi trong một câu. |
| **Chuỗi ngày, nhắc nhở, "hôm nay chưa chat"** | Ràng buộc đạo đức có sẵn của PRD. Một chatbot nhắc nhở là một chatbot tạo phụ thuộc. |
| **Gửi lại toàn bộ lịch sử mỗi lượt** | Chi phí tăng tuyến tính mãi mãi, và vài tuần là vỡ context. Dùng cửa sổ trượt có trần. |

---

## 3. Đường xử lý khủng hoảng — phần quan trọng nhất của spec

### 3.1. Hai lớp phát hiện độc lập, kích hoạt bởi MỘT trong hai

**Lớp 1 — từ khoá tiếng Việt.** Nhanh, miễn phí, tất định, chạy **trước** khi gọi model. Danh sách cố ý bao rộng.

**Lớp 2 — model tự đánh giá.** Prompt yêu cầu model trả thêm một nhãn mức độ lo ngại trong cùng lượt gọi. Không tốn thêm tiền.

Bắt được ở lớp 1 thì **không gọi model** — trả thẳng phản hồi khủng hoảng. Không có lý do gửi câu đó ra provider.

### 3.2. Chiều sai lầm được chọn có chủ đích

**Thà báo nhầm còn hơn bỏ sót.** Báo nhầm là thầy cô hỏi thăm một em đang ổn — hơi ngượng. Bỏ sót là một đứa trẻ gặp nguy mà không ai biết.

Cùng triết lý đã áp cho bộ lọc chẩn đoán ở Spec #3, cùng lý do.

### 3.3. Khi kích hoạt, AI dừng vai bạn tâm sự

Không an ủi tiếp, không tư vấn, không "kể cho tôi nghe thêm". Hiện Tổng đài 111 (24/7, miễn phí), khuyên nói với người lớn tin tưởng **ngay**.

Model không phải người có chuyên môn. Đây là lúc nó phải biết mình không phải.

### 3.4. Cảnh báo chứa gì — và KHÔNG chứa gì

```ts
crisisAlerts/{alertId} {
  userId: string,          // để thầy cô biết đi gặp AI
  severity: "urgent" | "concern",
  triggeredBy: "keyword" | "model" | "both",
  createdAt: Timestamp,
  handledBy: string | null,
  handledAt: Timestamp | null,
}
```

**Không có `messageText`. Không có trích đoạn. Không có tóm tắt.**

Lý do: việc của thầy cô là **đi gặp em đó**, không phải đọc em viết gì. Nguyên văn không làm can thiệp tốt hơn, chỉ làm nó xâm phạm hơn — và một em biết câu chữ của mình bị đọc nguyên văn sẽ không viết thật lần sau, tức là cảnh báo lần hai không bao giờ xảy ra.

`severity` vẫn cần: thầy cô phải biết đi ngay hay đợi hết tiết.

### 3.5. Học sinh phải được biết trước

Màn hình chat nói rõ, **trước khi em gõ chữ đầu tiên**:

> "Nếu em nói điều gì khiến chúng tôi lo cho sự an toàn của em, thầy cô sẽ được báo để giúp em."

Đây **không phải** mục tuỳ chọn. Một em phát hiện ra sau lưng mình có cảnh báo mà không ai nói trước thì mất niềm tin vào cả app lẫn thầy cô. Nói trước là cách duy nhất giữ cho cảnh báo còn tác dụng lần sau.

Câu hứa "thầy cô không đọc được nội dung riêng tư" ở các màn hình khác cũng phải sửa cho khớp — không được để hai màn hình nói hai điều khác nhau.

---

## 4. Mô hình dữ liệu

```ts
chatSessions/{sessionId} {
  userId: string,
  startedAt: Timestamp,
  lastMessageAt: Timestamp,
  messageCount: number,
}

chatMessages/{messageId} {
  userId: string,          // trùng lặp có chủ đích: rule kiểm được mà không cần get() cha
  sessionId: string,
  role: "user" | "assistant",
  text: string,
  isCrisisResponse: boolean,
  createdAt: Timestamp,
}
```

`userId` lặp ở `chatMessages` là **cố ý**: Firestore rule đọc document cha tốn một read và làm rule giòn. Trùng một trường rẻ hơn nhiều.

---

## 5. Security Rules

```js
match /chatSessions/{id} {
  allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
  allow read, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow update: if false;   // chỉ Cloud Function
}

match /chatMessages/{id} {
  allow read, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow create, update: if false;   // chỉ Cloud Function — kể cả tin của chính học sinh
}

match /crisisAlerts/{id} {
  allow read:   if isAdmin();
  allow update: if isAdmin()
                && request.resource.data.diff(resource.data)
                     .affectedKeys().hasOnly(["handledBy", "handledAt"])
                && request.resource.data.handledBy == request.auth.uid;
  allow create, delete: if false;
}
```

**Admin KHÔNG đọc được `chatMessages`.** Cảnh báo là thứ duy nhất vượt ranh giới, và nó không mang nội dung.

Tin của học sinh cũng do Cloud Function ghi, không phải client: như vậy không thể có tin nhắn nào lọt vào DB mà chưa qua lớp phát hiện khủng hoảng.

---

## 6. Quota — phải xây lại

`quotaStudentPerDay = 5` là 5 lần phản chiếu. Với chat, 5 tin là chưa kịp nói gì.

Thêm `chatQuotaPerDay` riêng (đề xuất mặc định 30), đếm **tin nhắn của học sinh**. Dùng lại `consumeQuota` với khoá khác.

Lưu ý chi phí: mỗi tin gửi kèm N lượt gần nhất, nên **tin thứ 30 đắt hơn tin thứ nhất nhiều**. Trần cửa sổ trượt là phanh thật, không phải tối ưu.

**Phản hồi khủng hoảng không tính quota.** Một em đang khủng hoảng không được gặp câu "em hết lượt hôm nay".

---

## 7. Xoá dữ liệu

`chatSessions`, `chatMessages`, `crisisAlerts` **phải** vào `collectDeletionTargets()`.

Sổ đăng ký này đã bị quên ba lần (`cbtSessions`; rồi `aiJournalOutputs` + `aiUsage` bị cả một spec bỏ sót). Spec #3 đã thêm test suy ra danh sách từ `firestore.rules` — test đó sẽ bắt được nếu spec này quên.

**Câu hỏi cần con người quyết:** `crisisAlerts` có nên xoá theo tài khoản không? Nó là hồ sơ an toàn, không phải nội dung riêng tư, và có thể có nghĩa vụ lưu. Mặc định của spec: **có xoá** — nhất quán với lời hứa xoá. Nếu nhà trường cần lưu, đó là quyết định có ý thức, ghi vào checklist.

---

## 8. Ràng buộc đạo đức (kế thừa + mới)

Kế thừa nguyên vẹn từ Spec #3: nhãn "Nội dung do AI tạo", ngôn ngữ phỏng đoán, cấm ngôn ngữ chẩn đoán, `aiOptIn` mặc định tắt, mood log không phụ thuộc AI.

Mới:
1. **Không chuỗi ngày, không nhắc nhở, không thông báo đẩy.**
2. **AI không được giả vờ là người.** Hỏi thì nói thật là AI.
3. **AI không hứa giữ bí mật** — nó không giữ được, vì có đường cảnh báo.
4. **Học sinh xoá được từng tin và cả hội thoại.**

---

## 9. Rủi ro

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R1 | Bỏ sót dấu hiệu tự hại | Hai lớp độc lập, cố ý bao rộng, một trong hai kêu là đủ |
| R2 | Cảnh báo rơi vào trang không ai mở | **Không giảm thiểu được bằng code** — xem §10 |
| R3 | Học sinh mất niềm tin vì bị báo mà không biết trước | Nói rõ trước tin nhắn đầu tiên |
| R4 | Chi phí vượt kiểm soát | Quota riêng theo tin, cửa sổ trượt có trần, kill switch |
| R5 | AI tạo phụ thuộc, thay thế người lớn | Cấm nhắc nhở; khủng hoảng thì dừng vai và đẩy về người thật |
| R6 | Báo nhầm nhiều tới mức thầy cô bỏ qua | Theo dõi tỉ lệ sau tuần đầu; đây là lý do có `severity` |

---

## 10. Việc con người phải chốt — chặn bật cho học sinh

| Mức | Việc |
|---|---|
| **Chặn** | **Ai nhận cảnh báo, và trong bao lâu phải phản hồi?** Cảnh báo kỹ thuật mà đằng sau không có quy trình con người thì tệ hơn không có — nó vừa hứa với học sinh một điều nó không giữ. |
| **Chặn** | Chuyên gia tâm lý duyệt câu chữ phản hồi khủng hoảng và danh sách từ khoá |
| **Chặn** | Quyết `crisisAlerts` có xoá theo tài khoản không |
| Không chặn code | `chatQuotaPerDay` mặc định, độ dài cửa sổ trượt |
