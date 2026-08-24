# ExamCalm — Lộ trình phần còn lại của PRD

**Ngày:** 2026-08-23
**Nguồn:** `PRD_Web_Ho_Tro_Giam_Lo_Au_Thi_Cu_THPT_v3.0_Firebase.md`
**Trạng thái hiện tại:** Spec #1 (Phase 0 + 1) đã code xong 22/25 task
**Mục đích:** chia phần PRD chưa làm thành các spec độc lập, có thứ tự và điều kiện tiên quyết rõ ràng

Tài liệu này **không phải** implementation plan. Mỗi spec bên dưới cần chu trình riêng: brainstorm → design spec → implementation plan → code. Đây là bản đồ để biết làm gì trước, làm gì sau, và cái gì đang bị chặn bởi quyết định của con người chứ không phải bởi code.

---

## 1. Đã có gì

Spec #1 phủ Phase 0 + 1 của PRD, và trên đường đi có mở rộng thêm một số thứ PRD xếp ở phase sau vì chúng rẻ và cần thiết:

| Khối | Trạng thái |
|---|---|
| Firebase 2 project, Emulator, CI/CD | ✅ |
| Firestore Security Rules (`users`, `testAttempts`, `moodLogs`, `resources`, `testDefinitions`, `favorites`, `auditLogs`, catch-all) | ✅ 61 test |
| Auth email/password + xác thực email + hồ sơ | ✅ |
| Test lo âu: Guest làm trong phiên, Student lưu `testAttempts` | ✅ |
| Mood Journal + mascot mèo (**chưa AI**) | ✅ |
| Thư viện tài nguyên + lưu bài yêu thích | ✅ |
| Trang Tiến trình (lịch sử đơn giản, **không phải** Dashboard PRD 7.2.9) | ✅ |
| Admin console: test, thư viện, người dùng, audit log | ✅ |
| Xóa dữ liệu liên đới + đồng ý nghiên cứu + export ẩn danh | ✅ |
| Trang chủ, seed, E2E, deploy | ⏳ Task 23–25 |

**Chưa làm, thuộc PRD:** toàn bộ AI Layer, CBT, Confession + moderation, Music Hub, Dashboard cá nhân hóa, Analytics.

---

## 2. Thứ tự đề xuất — và chỗ em lệch khỏi PRD

PRD §12 đề xuất: AI (Phase 2) → CBT + Confession (Phase 3) → Music + Dashboard (Phase 4).

**Em đề xuất đảo CBT lên trước AI.** Ba lý do:

1. **CBT làm sống lại một tính năng đã code mà chưa dùng được.** Trang Tiến trình có hàm `pairBeforeAfter` ghép cặp mood trước/sau hoạt động — đã viết, đã test, nhưng **hiện không có gì tạo ra dữ liệu đó**, vì Mood Widget mới chỉ ghi loại `standalone`. CBT là hoạt động đầu tiên có Mood Before/After thật. Làm CBT xong thì một phần Spec #1 mới thực sự chạy.
2. **CBT tái dùng gần như toàn bộ khuôn của Test.** Nội dung versioned trong Firestore, admin CRUD, disclaimer, banner nội dung mẫu. Rủi ro kỹ thuật thấp nhất trong mọi thứ còn lại.
3. **CBT không tốn tiền.** AI là thứ đầu tiên trong dự án này phát sinh chi phí theo lượt dùng. Nên có thêm một hoạt động thật cho học sinh trước khi mở van chi phí.

Thứ tự chốt:

```
Spec #2  CBT                       ← rẻ, gỡ nợ kỹ thuật của Spec #1
Spec #3  AI Layer                  ← điểm khác biệt của sản phẩm, bắt đầu tốn tiền
Spec #4  Confession + Moderation   ← rủi ro cao nhất, PHẢI có AI trước
Spec #5  Music Hub                 ← chặn bởi giấy phép, không phải bởi code
Spec #6  Dashboard + Analytics     ← cần dữ liệu từ tất cả phần trên
```

---

## 3. Từng spec

### Spec #2 — CBT (Nhận diện suy nghĩ tiêu cực)

**PRD:** §7.2.5 · **Phụ thuộc:** Spec #1 · **Quy mô ước tính:** 10–14 task

Bộ câu hỏi giúp học sinh nhận diện suy nghĩ tiêu cực quanh chuyện thi cử, có Mood Before và Mood After, kết quả kèm lý giải và link sang Thư viện.

**Cần xây:**
- `cbtModules` + `cbtSessions` (schema đã có sẵn trong PRD §5.4–5.5, chưa code)
- Rules cho hai collection này — `cbtSessions` riêng tư như `moodLogs`, admin **không** đọc được
- Admin console quản lý `cbtModules` — sao chép khuôn `TestEditor`
- **Mood Before/After thật:** Mood Widget cần nhận `context` và `linkedActivityRef` từ hoạt động đang mở, thay vì luôn ghi `standalone`

**Rủi ro chính:** nội dung CBT là TBD của PRD §13, **cần chuyên gia tâm lý thẩm định**. Cùng cơ chế như Test: seed dữ liệu mẫu có nhãn, thay bằng nội dung thật qua Admin console không sửa code.

**Con người phải chốt trước:** không có gì bắt buộc — có thể code với nội dung mẫu như Spec #1 đã làm.

---

### Spec #3 — AI Layer (Genkit)

**PRD:** §7.2.3, §8 · **Phụ thuộc:** Spec #1 · **Quy mô ước tính:** 14–18 task

Mascot mèo phản chiếu cảm xúc: `reflectionText`, `catStoryText`, `journalPrompt`, gợi ý tài nguyên.

**Cần xây:**
- Genkit trong `functions/`, provider Vertex AI/Gemini qua abstraction layer
- `moodReflectionFlow` + `storyGenerationFlow` → ghi `aiJournalOutputs` (client **không** ghi trực tiếp)
- `promptTemplates` versioned + Admin UI test prompt trước khi publish
- `systemConfig/aiConfig`: quota Guest/Student, rate limit, **kill switch từng feature**
- `guestQuota` + Firebase Anonymous Auth cho Guest
- **Chuyển App Check từ monitor-only sang enforce** — Spec #1 đã wiring sẵn, đây là lúc bật
- Post-processing chặn ngôn ngữ chẩn đoán

**Đây là spec đầu tiên tốn tiền thật.** Mỗi lượt mood check-in có AI là một lần gọi model. Trước khi bắt đầu phải có: budget alert, quota mặc định thấp, kill switch chạy được và đã test.

**Ràng buộc đạo đức bắt buộc:**
- Mọi output AI gắn nhãn "Nội dung do AI tạo"
- Ngôn ngữ hedge bắt buộc ("có vẻ", "từ những gì bạn chia sẻ")
- **Mood log phải lưu được kể cả khi AI lỗi** — core feature không phụ thuộc AI layer
- Không gửi ghi chú sang provider ngoài nếu `privacySettings.aiOptIn` chưa bật

**Con người phải chốt trước:** provider chính thức, data processing terms, và **xác nhận provider tắt "data retention for training"**. Đây là ghi chú cảm xúc của trẻ vị thành niên gửi sang bên thứ ba — không được bắt đầu code khi chưa rõ điều khoản.

---

### Spec #4 — Confession + AI Moderation

**PRD:** §7.2.7, §8.2 · **Phụ thuộc:** Spec #3 (cần AI để moderate) · **Quy mô ước tính:** 16–20 task

**Đây là tính năng rủi ro cao nhất trong toàn bộ sản phẩm.** Học sinh vị thành niên đăng nội dung ẩn danh cho học sinh khác đọc. Sai ở đây không phải bug, là hậu quả thật lên người thật.

**Cần xây:**
- `confessions` (có `authorUid`) và `confessionsPublic` (**không** có `authorUid`) — tách hoàn toàn, chỉ Cloud Function ghi sang
- Pipeline: normalize → hard-rule → AI classify → risk score → decision → `moderationLogs`
- `moderationRules` versioned, admin duyệt rule do AI đề xuất
- Admin Moderation Console: queue, override, audit
- Nút Report cho bài đã public

**Fail-safe bắt buộc:** model lỗi hoặc confidence thấp → **luôn** chuyển `hold`. Không bao giờ auto-public khi không chắc chắn.

**Con người phải chốt trước:** policy Confession, taxonomy moderation, threshold. Và một câu hỏi vận hành nghiêm túc mà PRD chưa trả lời: **ai là người trực queue moderation, và trong bao lâu?** Một bài bị `hold` mà không ai duyệt trong ba ngày là một học sinh bị bỏ rơi sau khi đã mở lòng. Nếu chưa có người trực, cân nhắc hoãn tính năng này.

---

### Spec #5 — Music Hub

**PRD:** §7.2.8, §5.12–5.13 · **Phụ thuộc:** Spec #1 · **Quy mô ước tính:** 12–16 task

**Bị chặn bởi giấy phép, không phải bởi code.** PRD §13 yêu cầu xác nhận hợp đồng Epidemic Sound và quyền sử dụng media public. Không nên viết dòng nào trước khi rõ nguồn nhạc nào được phép dùng.

**Cần xây:** `mediaAssets` với metadata quyền sử dụng bắt buộc, `playlists`, Firebase Storage + `storage.rules` (hiện đang deny toàn bộ), player, YouTube embed theo allowlist.

**Tin tốt:** allowlist YouTube đã có sẵn và đã bị tấn công thử ở Spec #1 (`src/lib/video.ts`) — dùng lại nguyên vẹn.

---

### Spec #6 — Dashboard cá nhân hóa + Analytics

**PRD:** §7.2.9, §7.3.6, §5.17 · **Phụ thuộc:** #2, #3, #4, #5 · **Quy mô ước tính:** 12–16 task

Dashboard thật của PRD, khác với trang Tiến trình đơn giản của Spec #1.

**Cần xây:** `dashboardRollups` precompute bằng scheduled Cloud Function, biểu đồ 7/30/90 ngày, AI Weekly Reflection, GA4 + `analyticsDaily`.

**Ràng buộc diễn giải bắt buộc:** mục "Điều đang giúp bạn nhiều nhất" phải diễn đạt là **tương quan/pattern**, tuyệt đối không phải hiệu quả nhân quả. Spec #1 đã đặt tiền lệ ở trang Tiến trình — giữ nguyên tinh thần đó.

**Không gửi nội dung nhật ký hay confession vào GA4** — chỉ tên sự kiện.

---

### Spec #7 — Góc Cây Bình Yên (game hoá) — CHỜ, chưa lên lịch

**Nguồn:** `WEB/DES GAME/ExamCalm_Goc_Cay_Binh_Yen_Asset_Pack_v1.1/` (60 file PNG, kèm
`ASSET_MANIFEST.csv`) và `WEB/Mini-GDD_Goc_Cay_Binh_Yen_v1.0.docx`. Asset đã có đủ:
5 giai đoạn cây, 4 vật phẩm chăm sóc, 15 đồ trang trí, 3 nền, 14 icon UI, 9 hiệu ứng.

> `WEB/` nằm ngoài git (54MB) — asset gốc chỉ có trên máy anh Hải Anh. Khi làm spec này
> phải nén như đã làm với mascot ở Spec #1: PNG gốc ~1MB/file, nén WebP còn 5–8KB.

**Cơ chế theo Mini-GDD:** Điểm Mầm (tiền tệ) + Growth XP (tiến độ cây). Tưới nước +5 XP,
nắng trong lọ +10, đất dinh dưỡng +18, chuông gió +12. Cây lên bậc ở mốc 30/80/160/280 XP.
Có cửa hàng và kho đồ.

**KHÔNG có trong PRD v3.0.** Đây là hướng mở rộng do designer đề xuất, không phải yêu cầu gốc.

**Xung đột thiết kế phải giải trước khi code — đây là lý do spec này bị hoãn:**

Nguyên tắc §3.9 của spec nền tảng cấm mọi cơ chế gây áp lực: không streak, không đếm ngày
liên tiếp, không "bạn đã bỏ lỡ". Một cái cây cần chăm sóc là cơ chế gây áp lực **rất mạnh** —
mạnh hơn streak, vì nó gắn cảm giác tội lỗi vào một sinh vật sống. Học sinh nghỉ ba hôm rồi
quay lại thấy cây héo sẽ nhận đúng thông điệp mà sản phẩm này tồn tại để chống lại.

**Ràng buộc bắt buộc nếu làm:**
- Cây KHÔNG BAO GIỜ héo, chết, hay lùi bậc. Không vào chăm thì nó đứng yên chờ, thế thôi.
- Không thông báo đẩy, không nhắc nhở, không đếm ngày.
- Growth XP chỉ tăng, không bao giờ giảm.
- Không so sánh cây giữa các học sinh, không bảng xếp hạng.
- Ngôn ngữ khi quay lại sau thời gian dài phải là chào đón, không phải trách móc.

**Chưa chốt:** kiếm Điểm Mầm bằng cách nào. Nếu gắn vào "làm bài test" hay "ghi nhật ký"
thì vô tình biến việc tự chăm sóc sức khỏe tinh thần thành nhiệm vụ farming — cần cân nhắc kỹ.

---

## 4. Quy ước kỹ thuật rút ra từ Spec #1

Những mục dưới đây **phải nằm trong Global Constraints của mọi spec sau**. Mỗi cái đều là một lỗi thật đã tốn ít nhất một vòng sửa trong Spec #1.

| # | Quy ước | Đã trả giá ở đâu |
|---|---|---|
| 1 | **Mọi** lời gọi Firestore/callable từ client — **kể cả hàm ĐỌC và XÓA** — phải `await ensureAuthReady()` trước. **Khi viết plan mới, code mẫu PHẢI có sẵn dòng này ở mọi hàm chạm Firestore.** | Phát hiện lại **7 lần** ở Spec #1. Ở Spec #2, code mẫu trong plan lại quên nó ở hàm đọc **3 lần nữa** (Task 4, Task 7) — implementer tự phát hiện nhờ ràng buộc, nhưng lẽ ra plan không được sai ngay từ đầu. |
| 2 | Không bao giờ `{...(d.data() as T)}` — liệt kê từng field tường minh | `Timestamp` lọt vào Client Component làm sập trang test |
| 3 | Tải hỏng phải có trạng thái **riêng**, không gộp thành danh sách rỗng | 4 lần: MoodHistory, SavedResourceList, ProgressView, TestEditor |
| 4 | Trang public đọc Firestore dùng `force-dynamic`, **không** `revalidate` | `npm run build` đòi có database, hỏng CI |
| 5 | Script chạy bằng `tsx` có top-level await phải đặt đuôi `.mts` | `bootstrap-admin` không chạy được — chỉ lộ khi thử chạy thật |
| 6 | Không xuất bất kỳ trường văn bản tự do nào ra file nghiên cứu | `tags` suýt mang tên bạn cùng lớp vào dữ liệu KHKT |
| 7 | Sửa lỗi xong phải để lại test canh đúng lỗi đó, và **tự phá code để xác nhận test đỏ** | Nhiều test trông như coverage nhưng không bắt được regression |
| 8 | Kiểm chứng bằng chạy thật, không bằng suy luận | Race auth, Timestamp, script không chạy — không lỗi nào lộ ra qua đọc code |

---

## 5. Việc con người phải chốt, xếp theo mức chặn

| Hạng mục | Chặn spec nào | Tính chất |
|---|---|---|
| **Blaze plan cho 2 project** | Task 25 (deploy) — **đang chặn** | Gắn thẻ, 5 phút |
| Thang đo lo âu được thẩm định | Không chặn code; chặn **mở cho học sinh thật** | Cần chuyên gia tâm lý |
| Điều khoản dữ liệu của AI provider | Spec #3 | Đọc hợp đồng, xác nhận tắt training retention |
| Policy + taxonomy Confession | Spec #4 | Cần quyết định giáo dục |
| **Người trực queue moderation** | Spec #4 | Cần cam kết vận hành, không phải kỹ thuật |
| Giấy phép Epidemic Sound / nguồn nhạc | Spec #5 | Hợp đồng |
| Consent/retention cho vị thành niên | Trước khi mở thật | **Cần tư vấn pháp lý** |
| Tên + visual mascot | Không chặn | `CatMascot` là component riêng, thay 1 file |

---

## 6. Khuyến nghị

**Làm ngay:** xong Task 23–25, gắn Blaze, deploy lên `examcalm.web.app`. Có một sản phẩm chạy được thật trước khi mở rộng.

**Kế tiếp:** Spec #2 (CBT). Rẻ, rủi ro thấp, và làm sống lại phần Mood Before/After đã code sẵn.

**Cân nhắc kỹ trước khi làm:** Spec #4 (Confession). Về mặt kỹ thuật hoàn toàn khả thi, nhưng nó tạo ra một nghĩa vụ vận hành liên tục — phải có người thật đọc queue mỗi ngày. Nếu chưa có cam kết đó, tính năng này nên hoãn, không nên làm rồi để đấy.

---

*Hết lộ trình — cập nhật khi mỗi spec được chốt*
