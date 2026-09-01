# ExamCalm — Phạm vi đợt dựng lại theo Brand Guideline v1.1

> Trạng thái: **đã duyệt 01/09/2026**. Cách chia A → B → C → D được chấp nhận.
> Ba quyết định ở mục 5 đã có câu trả lời: **1c · 2a · 3 = AI duyệt tự động**.
> Đây vẫn chưa phải spec thiết kế — spec từng gói viết riêng.
> Đây là tài liệu chia việc: nó chốt *làm gì trước, làm gì sau*, và nêu
> những quyết định phải có câu trả lời trước khi viết dòng code đầu tiên.
>
> Ngày: 01/09/2026 · Người viết: trợ lý · Người duyệt: Lương Hải Anh

---

## 1. Vì sao có tài liệu này

Hai nguồn đầu vào đến cùng lúc:

1. **Phản hồi của học sinh** sau đợt test thật — 33 điểm cụ thể, chia 5 nhóm.
2. **Brand Guideline ExamCalm v1.1** vừa được thêm vào project — PDF 31 trang,
   design tokens, motion spec, bộ ảnh Meo.

Gộp lại thì đây không phải "sửa vài chỗ". Nó là **thay nền hệ thống thiết kế**
(bảng màu semantic, font, app shell, navigation) rồi dựng lại gần như mọi màn
hình trên nền mới. Một spec duy nhất sẽ quá lớn để làm đúng, nên tài liệu này
tách thành bốn gói chạy tuần tự.

Tính năng AI **để nguyên, không đụng tới** trong đợt này theo yêu cầu của chủ
sản phẩm — trừ một ngoại lệ đã nêu ở mục 5, câu hỏi 1.

---

## 2. Thứ tự ưu tiên nguồn tài liệu

Bộ guideline tự quy định điều này ở trang A5. Ghi lại đây để sau này không ai
phải đoán:

> Khi PDF v1.0 khác v1.1, thì **5 trang override A1–A5 và ba file kỹ thuật
> (JSON, CSS, motion spec) được ưu tiên**.

Hai chỗ đã áp dụng luật này:

| Điểm | v1.0 nói | v1.1 nói | Lấy |
|---|---|---|---|
| Top bar mobile | 60 px (trang 11) | 88 px (JSON + migration note) | **88 px** |
| `text.muted` | `#667986` (trang 6) | `#5C6F7D` (trang A2) | **`#5C6F7D`** |

Lý do v1.1 đổi `text.muted`: màu cũ không đạt WCAG AA trên nền kem `#FFF9F1`.
Đây là sửa lỗi tiếp cận, không phải đổi gu thẩm mỹ.

---

## 3. Bốn gói việc

Bốn gói **phải chạy tuần tự**. B, C, D đều dựng trên token và app shell của A;
đảo thứ tự nghĩa là làm màn hình xong rồi đổi nền, phải sửa lại từ đầu.

Thứ tự này khớp với thứ tự mà chính guideline đề xuất ở trang 25 và mục 13 của
motion spec.

### Gói A — Nền hệ thống

Không có màn hình mới nào. Đây là lớp nền mọi thứ khác đứng lên.

- Nạp `examcalm-design-tokens.v1.1.css`, ánh xạ sang Tailwind 4
- Font **Be Vietnam Pro** (giao diện) + **Nunito** (chỉ cho lời thoại Meo),
  thay Geist đang dùng
- App shell: logo trong brand zone **góc trái trên cùng**, cố định, không nhảy
  vị trí giữa các route
  - Desktop ≥1280: sidebar 248 px, logo 120 px, offset 24 px, container tối đa 1200 px
  - Laptop 1024–1279: sidebar thu gọn được, brand zone 168 px
  - Tablet 768–1023: navigation rail, logo 96 px
  - Mobile 0–767: top brand bar 88 px + bottom nav 68 px có safe-area
- Navigation theo trang 12 của guideline:
  - Desktop: Trang chủ · Nhật ký cảm xúc · Dashboard · Bài kiểm tra · Bài tập CBT
    · Thư viện · Music Hub · Confession · Trò chuyện AI với Meo
  - Mobile bottom nav 5 mục: Trang chủ · Nhật ký · Dashboard · Thư viện · **Tất cả**
    ("Tất cả" mở bottom sheet chứa phần còn lại)
  - Mục chưa có trang (Music Hub, Confession) hiện nhãn **"Sắp ra mắt"** cho tới
    khi gói D xong — guideline đã có tiền lệ cho cách này với Góc Cây Bình Yên
- Component nền: Button (primary / secondary / soft / ghost), Card, Form
  (label luôn hiện, input ≥44 px, focus ring `#245CFF` 2 px + 3 px/28%)
- Trạng thái chuẩn: loading, empty, success, error
- Motion tokens + page transition (fade + translate 10 px, 240 ms) +
  **`prefers-reduced-motion` là bắt buộc**, không phải tuỳ chọn

**Giải quyết:** logo quá nhỏ · desktop trống hai bên · menu chật và xuống hai hàng.

### Gói B — Năm màn hình chính

- **Trang chủ**: đổi từ hai nút sang câu hỏi *"Bạn cần gì lúc này?"* + **ba cửa
  vào theo nhu cầu** (trang 20 của guideline):
  - Hiểu cảm xúc → Bài kiểm tra hoặc Nhật ký cảm xúc
  - Bình tĩnh lại → Bài tập CBT hoặc Music Hub
  - Tìm một hoạt động → Thư viện hoặc Confession
- **Nhật ký cảm xúc**: viết lại toàn bộ từ ngữ (chi tiết ở mục 4), Meo ở trạng
  thái "đang lắng nghe", phần nhập liệu vẫn là trung tâm
- **Dashboard**: dựng lại trang Tiến trình thành **báo cáo cá nhân hoá**
  (trang 22). Mỗi card trả lời đúng một câu hỏi: *tôi đang ở đâu · tôi vừa làm
  gì · tôi có thể thử gì tiếp theo*. Biểu đồ xu hướng 7/30/90 ngày.
  **Cấm tuyệt đối**: điểm sức khoẻ tâm thần tổng hợp, bảng xếp hạng, streak,
  khẳng định nhân quả. Chart phải ghi rõ nguồn là dữ liệu tự báo cáo.
- **Thư viện**: ô tìm kiếm + chip lọc; cuối mỗi bài có bốn thứ — một việc thử
  ngay, bài viết/video liên quan, bài tập CBT phù hợp, nút lưu
- **Bài kiểm tra + kết quả**: metadata trước khi bắt đầu (số phút, số câu, giúp
  hiểu gì, đã qua chuyên gia chưa); chia từng câu hoặc hiện rõ "Câu 1/7"; rút
  gọn đoạn cảnh báo và bỏ bớt chữ in hoa; trang kết quả theo trang 24

### Gói C — Khách · Đăng ký · Tách Meo khỏi Chatbot

- **Sửa mâu thuẫn lớn nhất hiện nay**: trang chủ nói dùng được không cần tài
  khoản, nhưng mở Nhật ký hay CBT thì bị chặn đăng ký ngay. Cho khách làm thử
  **ít nhất một bài CBT trọn vẹn**, xong mới hỏi *"Bạn có muốn tạo tài khoản để
  lưu lại không?"*
- **Form đăng ký/đăng nhập**: dấu sao cho mục bắt buộc; giải thích ngắn vì sao
  hỏi khối lớp / trường / mục tiêu thi; nút hiện-ẩn mật khẩu; câu "Đã có tài
  khoản? Đăng nhập"
- **Trang Hồ sơ**: xem được thông tin cá nhân đã điền lúc tạo tài khoản
- **Tour Meo** (guideline §6.1): máy trạng thái
  `not_started → active → paused / dismissed / completed`, tối đa 5 bước, luôn
  có "Bỏ qua" và "Để sau", lưu tiến độ, xong rồi không tự chạy lại, mở lại được
  từ Trợ giúp. **Không có ô nhập chat trong coach mark.**
- **Chatbot** (guideline §6.2): đổi thành **"Hỏi về web app"**, chỉ mở khi người
  dùng chủ động bấm, phạm vi là điều hướng / tính năng / tài khoản / cài đặt /
  quyền riêng tư. Xem câu hỏi 1 ở mục 5 trước khi làm phần này.
- **Widget Meo** hiện chưa nói rõ để làm gì → thêm nhãn chữ, không chỉ icon

### Gói D — Mở rộng

- **Music Hub** — thay vị trí "Đã lưu" trên menu
- **Confession** — xem câu hỏi 3 ở mục 5
- Metadata cho bài tập CBT: *"5 phút · 4 bước · Giúp nhìn lại một suy nghĩ gây lo"*

---

## 4. Bảng đối chiếu — 33 phản hồi đi về đâu

Bảng này để anh soát xem có điểm nào bị bỏ sót không.

### Nhóm 1 — Bài kiểm tra

| # | Phản hồi | Gói |
|---|---|---|
| 1.1 | Ghi rõ mất khoảng bao nhiêu phút | B |
| 1.2 | Ghi rõ có bao nhiêu câu | B |
| 1.3 | Ghi rõ bài test giúp hiểu điều gì | B |
| 1.4 | Ghi rõ đã được chuyên gia kiểm tra hay chưa | B |
| 1.5 | GAD-7 hiện cả 7 câu cùng lúc → chia từng câu hoặc "Câu 1/7" | B |
| 1.6 | Cảnh báo đầu bài quá dài, nhiều chữ in hoa → rút gọn | B |

### Nhóm 2 — Bài tập CBT

| # | Phản hồi | Gói |
|---|---|---|
| 2.1 | Ghi rõ thời gian, số bước, mục đích | B ¹ |
| 2.2 | Khách được làm thử ít nhất một bài rồi mới mời đăng ký | C |

¹ Guideline xếp CBT vào giai đoạn 3, nhưng 2.1 giống hệt 1.1–1.4 về bản chất.
Làm chung một lượt rẻ hơn tách ra. Đây là lệch có chủ ý so với thứ tự của
guideline, không phải nhầm.

### Nhóm 3 — Thư viện

| # | Phản hồi | Gói |
|---|---|---|
| 3.1 | Ô tìm kiếm | B |
| 3.2 | Cuối bài: một việc có thể thử ngay | B |
| 3.3 | Cuối bài: bài viết/video liên quan | B |
| 3.4 | Cuối bài: bài tập CBT phù hợp | B |
| 3.5 | Nút lưu để xem lại | B |

### Nhóm 4 — Đăng ký và đăng nhập

| # | Phản hồi | Gói |
|---|---|---|
| 4.1 | Dấu sao cho mục bắt buộc | C |
| 4.2 | Giải thích vì sao cần khối lớp, trường, mục tiêu thi | C |
| 4.3 | Nút hiện/ẩn mật khẩu | C |
| 4.4 | "Đã có tài khoản? Đăng nhập" | C |
| 4.5 | Sau đăng ký, Meo hướng dẫn từng bước, có "Bỏ qua"/"Để sau" | C |

### Nhóm 5 — Trang chủ và giao diện

| # | Phản hồi | Gói |
|---|---|---|
| 5.1 | Logo quá nhỏ → góc trái trên cùng | A |
| 5.2 | Desktop trống hai bên, giao diện đơn điệu | A |
| 5.3 | Menu chật; mobile tên tính năng xuống hai hàng | A |
| 5.4 | Widget Meo chưa rõ dùng làm gì → thêm nhãn | C |
| 5.5 | Trang chủ nói không cần tài khoản nhưng lại chặn ngay | C |
| 5.6 | Meo hướng dẫn tự xuất hiện một lần sau khi tạo tài khoản | C |
| 5.7 | Chatbot chỉ mở khi chủ động, nói rõ là hỗ trợ dùng web app | C |
| 5.8 | Chatbot trả lời "Nhật ký ở đâu?", không giống tư vấn tâm lý | C |
| 5.9 | Hai lựa chọn → ba nhu cầu rõ ràng | B |

### Yêu cầu thêm của chủ sản phẩm

| # | Yêu cầu | Gói |
|---|---|---|
| 6.1 | Nhật ký: từ khó hiểu như "hơi xuống" → thay bằng icon | B |
| 6.2 | Nhật ký: "ghi chú" → từ khuyến khích kể lại câu chuyện | B |
| 6.3 | Nhật ký: "thẻ ngữ cảnh" tối nghĩa → "trạng thái hiện tại" | B |
| 6.4 | Hồ sơ: xem được thông tin đã điền khi tạo tài khoản | C |
| 6.5 | Menu: "Đã lưu" → "Âm nhạc" | A + D ² |
| 6.6 | Menu: "Trò chuyện" đổi tên rõ hơn | A + C ³ |
| 6.7 | Tiến trình → bố cục báo cáo cá nhân hoá có biểu đồ | B |

² Nhãn menu đổi ở gói A; trang Music Hub thật xây ở gói D. Giữa hai mốc đó mục
này hiện nhãn "Sắp ra mắt". Xem câu hỏi 2 về chỗ ở mới của mục "Đã lưu".

³ Guideline chốt tên hiển thị là **"Trò chuyện AI với Meo"** trong navigation,
còn **"Hỏi về web app"** là nhãn của nút mở panel. Hai nhãn khác nhau là cố ý,
không phải thiếu nhất quán.

### Không nằm trong đợt này

- Toàn bộ tính năng AI (theo yêu cầu của chủ sản phẩm)
- Góc Cây Bình Yên (guideline ghi rõ đang pending)
- Analytics / GA4 / `analyticsDaily`
- Export Personal Report (PRD xếp Phase 2+)

---

## 5. Ba quyết định cần anh trả lời

### Câu hỏi 1 — Chatbot đổi vai, thì lớp an toàn giữ hay bỏ?

**Tình hình.** Code hiện tại (`functions/src/ai/sendChatMessage.ts`) là bạn đồng
hành cảm xúc: có phát hiện từ khoá khủng hoảng, ghi `crisisAlerts`, gửi mail cho
toàn bộ admin. Guideline §6.2 định nghĩa lại bề mặt này thành **trợ giúp sử dụng
web app** — phạm vi điều hướng, cài đặt, quyền riêng tư; "không chẩn đoán, không
thay chuyên gia".

**Rủi ro thật.** Một học sinh đang buồn vẫn có thể gõ "em muốn chết" vào ô đó.
Một con bot trả lời *"mình chỉ hỗ trợ cách dùng web thôi"* trong tình huống ấy
tệ hơn hẳn việc không có bot.

**Ba phương án:**

| | Phương án | Ưu | Nhược |
|---|---|---|---|
| **1a** | Giữ nguyên lớp phát hiện khủng hoảng, chỉ đổi giọng và phạm vi trả lời | An toàn không suy giảm; tận dụng toàn bộ code đã có và đã review kỹ | Bot vẫn cần AI bật mới chạy được |
| **1b** | Bỏ hẳn lớp an toàn, thuần trợ giúp sản phẩm | Đơn giản nhất, đúng chữ nghĩa guideline nhất | Mất lưới an toàn ở đúng nơi học sinh dễ buột miệng nhất |
| **1c** | Giữ lớp an toàn **và** làm bot bằng FAQ + deep link, không cần AI | Chạy được **ngay hôm nay** dù AI vẫn tắt; trả lời "Nhật ký ở đâu?" chính xác 100%, không bịa | Không trả lời được câu hỏi lạ ngoài danh sách |

**Đề xuất của trợ lý: 1c.** Lý do: guideline §6.2 đã tự nói *"Trả lời ngắn; ưu
tiên deep link hoặc CTA tới đúng màn hình"* — đó chính là mô tả của một FAQ có
điều hướng, không cần mô hình ngôn ngữ. Và vì API key hiện vẫn là giá trị giả,
1a lẫn 1b đều cho ra một tính năng **không dùng được** cho tới khi anh cắm key
thật; còn 1c dùng được ngay.

> **ĐÃ CHỌN (01/09/2026): 1c.** Giữ nguyên lớp phát hiện khủng hoảng; phần trả
> lời làm bằng FAQ có deep link, không gọi mô hình ngôn ngữ. Hệ quả kèm theo:
> bề mặt "Hỏi về web app" chạy được ngay cả khi AI đang tắt, và **không tiêu
> hạn mức AI** của học sinh.

---

### Câu hỏi 2 — "Đã lưu" nhường chỗ cho "Âm nhạc" thì đi đâu?

Nút tim trong Thư viện vẫn đang lưu bài bình thường. Nếu bỏ mục "Đã lưu" khỏi
menu mà không cho nó chỗ khác thì học sinh lưu xong không xem lại được — đúng
lỗi vừa mới sửa xong tuần trước.

| | Phương án | Ưu | Nhược |
|---|---|---|---|
| **2a** | Thành một chip lọc **"Đã lưu"** ngay trong Thư viện | Đúng chỗ người dùng tìm; guideline đã có sẵn hàng chip lọc ở trang 23 | Chỉ thấy khi đang ở Thư viện |
| **2b** | Thành một mục trong trang Hồ sơ | Gom chung với dữ liệu cá nhân | Xa nơi phát sinh hành vi lưu |
| **2c** | Giữ nguyên mục riêng trên menu, thêm Music Hub thành mục mới | Không mất gì | Menu dài thêm, đúng cái học sinh kêu chật |

**Đề xuất của trợ lý: 2a.**

> **ĐÃ CHỌN (01/09/2026): 2a.** "Đã lưu" thành chip lọc trong Thư viện. Route
> `/da-luu` giữ lại hay bỏ hẳn sẽ chốt trong spec gói B (nơi làm Thư viện);
> nếu bỏ thì phải có redirect, vì link cũ có thể đã nằm trong bookmark của
> học sinh.

---

### Câu hỏi 3 — Confession: ai trực hàng chờ duyệt?

> **ĐÃ CHỌN (01/09/2026): tích hợp AI để duyệt tự động** theo pipeline PRD §8.2.

**Hai điều kèm theo mà quyết định này KHÔNG xoá được — ghi lại để gói D không
bị hụt phạm vi:**

**1. Hàng chờ người thật vẫn tồn tại.** PRD §8.2 có ba nhánh, không phải hai:

| Nhánh | Xử lý |
|---|---|
| `auto_approved` | AI thấy rủi ro thấp → ghi sang `confessionsPublic` ngay |
| `hold` | AI không chắc hoặc rủi ro cao → **chờ người duyệt** |
| `reject` | Vi phạm rõ ràng → chặn |

AI làm hàng chờ **ngắn đi**, không làm nó biến mất. Gói D vẫn phải xây AI
Moderation Console (PRD §7.3.2) và câu "ai trực nhánh `hold`, trong bao lâu"
vẫn cần một câu trả lời — chỉ là nhẹ hơn nhiều so với duyệt 100% thủ công.
Cảnh báo cũ của roadmap vẫn đúng với riêng nhánh này:

> *"Một bài bị hold mà không ai duyệt trong ba ngày là một học sinh bị bỏ rơi
> sau khi đã mở lòng."*

**2. Cần API key thật.** `EXAMCALM_AI_API_KEY` hiện đang là giá trị giả
(`CHUA-CAU-HINH-...`). Không có key thật thì mọi bài rơi hết vào `hold` — tức
quay về đúng kịch bản duyệt thủ công 100%. Gói D còn xa nên chưa gấp, nhưng
đây là điều kiện tiên quyết, không phải chi tiết kỹ thuật phụ.

**Chưa cần trả lời ngay:** ngưỡng rủi ro của AI, taxonomy phân loại, và ai
trực nhánh `hold`. Ba thứ này chốt trong spec gói D.

---

## 6. Sau khi anh duyệt thì làm gì

1. Anh trả lời câu 1 và câu 2, và duyệt cách chia A → B → C → D
2. Trợ lý brainstorm chi tiết **gói A**, trình thiết kế theo từng phần
3. Anh duyệt thiết kế gói A → viết spec `2026-09-XX-examcalm-foundation-design.md`
4. Anh soát spec → viết implementation plan → code
5. Xong gói A thì lặp lại đúng vòng đó cho B, rồi C, rồi D

Mỗi gói là một chu kỳ spec → plan → code → review độc lập. Không gộp.

---

## 7. Điều trợ lý muốn nói thẳng

Bộ brand guideline này tốt hơn hẳn mức thường thấy ở một dự án học sinh: nó có
thứ tự ưu tiên nguồn, có acceptance criteria cho QA, có lý do đằng sau từng
quyết định màu, và quan trọng nhất là nó **cấm đúng những thứ nên cấm** — điểm
sức khoẻ tâm thần tổng hợp, bảng xếp hạng, streak, màu đỏ toàn màn hình, khẳng
định nhân quả. Đây là những cái bẫy mà rất nhiều app sức khoẻ tâm thần thương
mại rơi vào.

Khối lượng bốn gói này lớn — lớn hơn tất cả những gì đã làm từ đầu dự án cộng
lại. Nếu có deadline cuộc thi đang đến gần, anh nói sớm để trợ lý xếp lại thứ
tự theo cái gì học sinh nhìn thấy trước, thay vì làm cho đủ.
