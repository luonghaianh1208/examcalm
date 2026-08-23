# Design Spec — ExamCalm, Spec #2: CBT (Nhận diện suy nghĩ tiêu cực)

**Ngày:** 2026-08-23
**Phạm vi:** PRD §7.2.5 · §5.4–5.5
**Phụ thuộc:** Spec #1 (`2026-08-22-examcalm-foundation-design.md`) — đã hoàn thành
**Lộ trình:** `docs/superpowers/plans/2026-08-23-examcalm-roadmap.md`

---

## 1. Mục tiêu

Một bài tập CBT ngắn giúp học sinh nhận diện suy nghĩ tiêu cực quanh chuyện thi cử, ghi lại cảm xúc **trước và sau** khi làm, và kết thúc bằng một bước tiếp theo cụ thể trong Thư viện.

**Không phải trị liệu.** Đây là bài tập tự nhận thức (psychoeducation). Ngôn ngữ và disclaimer phải nói rõ điều đó, đúng như Test lo âu ở Spec #1.

## 2. Ngoài phạm vi

- AI (Spec #3) — `summary` do học sinh tự viết, không sinh tự động
- Nội dung CBT được chuyên gia thẩm định — seed dữ liệu mẫu có nhãn, như Spec #1
- Nhắc nhở, lịch trình, chuỗi ngày — cấm, đúng tinh thần Spec #1
- Dashboard rollup (Spec #6)

## 3. Vì sao làm CBT trước AI

Spec #1 đã code và test hàm `pairBeforeAfter` trong `src/lib/progress.ts`, ghép cặp cảm xúc trước/sau một hoạt động qua `moodLogs.linkedActivityRef`. **Hiện không có gì tạo ra dữ liệu đó** — `MoodWidget` luôn ghi `context: "standalone"`. CBT là hoạt động đầu tiên sinh ra cặp trước/sau thật, nên nó làm sống lại một phần Spec #1 đang nằm im.

## 4. Hai điểm lệch khỏi PRD, có chủ đích

### 4.1. Bỏ `moodBefore`/`moodAfter` khỏi `cbtSessions`

PRD §5.5 để hai field số này trên document session. Spec #1 lại ghép cặp cảm xúc qua `moodLogs` + `linkedActivityRef`. Giữ cả hai là **hai nguồn sự thật cho cùng một dữ liệu**, và chúng sẽ lệch nhau ngay lần đầu một bên ghi lỗi.

Chốt: dùng `moodLogs` làm nguồn duy nhất. `cbtSessions` không có field cảm xúc.

### 4.2. `answers` là `Record<string, string>`, không phải `Record<string, any>`

PRD §5.5 ghi `any`. Global Constraint của dự án cấm `any` không có comment giải thích. Câu hỏi CBT trong spec này đều là câu trả lời tự luận ngắn, nên `string` là đủ và đúng.

## 5. Thứ tự ghi — vì sao sinh id ở client

Cảm xúc **trước** cần trỏ tới session chưa tồn tại. Giải: lấy id trước khi ghi.

```
1. Client sinh sessionId    doc(collection(db, "cbtSessions")).id
2. Mood Before              linkedActivityRef: "cbtSessions/{sessionId}", context: "before"
3. Học sinh trả lời
4. Ghi session              setDoc(ref, {...})   ← id đã biết từ bước 1
5. Mood After               cùng linkedActivityRef, context: "after"
```

Nhờ vậy `cbtSessions` **chỉ cần create**, không cần update — giữ được tính bất biến giống `testAttempts`, và rule đơn giản hơn.

Nếu học sinh bỏ dở giữa chừng: có mood "before" mồ côi, không có session. `pairBeforeAfter` đã xử lý đúng — một `before` không có `after` thì không sinh cặp nào.

## 6. Mô hình dữ liệu

### `cbtModules/{moduleId}` — admin quản lý, versioned

```ts
{
  title: string,
  version: number,
  status: "draft" | "published",
  isSampleContent: boolean,        // như testDefinitions
  disclaimer: string,
  intro: string,                   // markdown ngắn, giới thiệu bài tập
  steps: [{ id: string, prompt: string, hint: string }],
  closingText: string,             // lời kết, markdown
  suggestedResourceSlugs: string[],// dẫn sang Thư viện
  updatedBy: string,
  updatedAt: Timestamp,
}
```

### `cbtSessions/{sessionId}` — riêng tư như `moodLogs`

```ts
{
  userId: string,
  moduleId: string,
  moduleVersion: number,
  answers: Record<string, string>,
  summary: string,                 // học sinh tự viết, có thể rỗng
  createdAt: Timestamp,
}
```

## 7. Security Rules

```js
match /cbtModules/{id} {
  allow read:  if resource.data.status == "published" || isAdmin();
  allow write: if isAdmin();
}

match /cbtSessions/{id} {
  allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
  allow read:   if isSignedIn() && resource.data.userId == request.auth.uid;
  allow update: if false;   // bất biến sau khi ghi, như testAttempts
  allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
}
```

**Admin KHÔNG đọc được `cbtSessions`** — giống `moodLogs`. Nội dung học sinh viết về suy nghĩ tiêu cực của mình còn riêng tư hơn điểm số. Đây là khác biệt có chủ đích so với `testAttempts` (admin đọc được).

## 8. Chỉ số trong `deleteUserData`

Cascade xóa của Spec #2 phải thêm `cbtSessions`. Hiện Cloud Function xóa `testAttempts`, `moodLogs`, `favorites`, rồi `users/{uid}`. Thêm `cbtSessions` vào **trước** bước xóa `users/{uid}`.

## 9. Ràng buộc đạo đức

1. Disclaimer hiện **vô điều kiện** ở đầu bài tập, như `TestRunner`.
2. Banner "nội dung mẫu" khi `isSampleContent` — cùng component `SampleContentBanner`.
3. Không so sánh học sinh với nhau, không chấm điểm bài CBT. Không có "đúng/sai".
4. Bỏ dở giữa chừng phải dễ và không bị nhắc nhở. Không có "bạn chưa hoàn thành".
5. Mood After là **tùy chọn**, bỏ qua được. Ép ghi cảm xúc sau một bài tập về suy nghĩ tiêu cực là phản tác dụng.

## 10. Quy ước kỹ thuật bắt buộc

Tám quy ước ở §4 của roadmap áp dụng đầy đủ. Đáng chú ý nhất cho spec này:

- Mọi hàm ghi client gọi `await ensureAuthReady()` đầu tiên
- Không `{...(d.data() as T)}` — liệt kê field tường minh
- Tải hỏng có trạng thái riêng, không gộp thành rỗng
- Trang public đọc Firestore dùng `force-dynamic`

## 11. Tiêu chí hoàn thành

- Học sinh đã xác thực email làm được bài CBT mẫu từ đầu tới cuối
- `moodLogs` sinh ra đúng một cặp `before`/`after` cùng `linkedActivityRef`
- Trang Tiến trình hiển thị cặp đó qua `pairBeforeAfter` **đã có sẵn**, không sửa hàm
- Admin tạo/sửa/publish `cbtModules` qua console
- Rules test phủ cả allow và deny cho hai collection mới
- `deleteUserData` xóa luôn `cbtSessions`
- Toàn bộ suite xanh, build sạch với emulator tắt

---

*Hết Design Spec #2 — ExamCalm CBT*
