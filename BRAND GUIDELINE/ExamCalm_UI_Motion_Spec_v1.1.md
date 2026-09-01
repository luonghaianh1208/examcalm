# ExamCalm UI & Motion Specification v1.1

> Cập nhật: 01.09.2026. Tài liệu này thay thế v1.0 cho phần màu semantic, vị trí logo trong web app và hành vi của mascot/chatbot. Những mục không được sửa vẫn giữ nguyên quyết định của v1.0.

## 1. Phạm vi và tên gọi

- Tên thương hiệu duy nhất: **ExamCalm**.
- Tên mascot duy nhất: **Meo**.
- Giữ nguyên tên tính năng: Bài kiểm tra, Bài tập CBT, Thư viện, Nhật ký cảm xúc, Music Hub, Confession, Trò chuyện AI với Meo.
- Góc Cây Bình Yên đang **pending**; không đưa vào navigation chính hoặc sprint ưu tiên.
- “Mascot hướng dẫn” là vai trò của Meo trong onboarding, không phải một tính năng mới và không đổi tên navigation.
- “Chatbot” trong tài liệu kỹ thuật là bề mặt **Trò chuyện AI với Meo**, được mở khi người dùng chủ động hỏi về cách sử dụng web app.

## 2. Quy tắc màu semantic

### 2.1 Nguyên tắc bắt buộc

1. Component phải dùng token semantic `background`, `text`, `border` hoặc `state`; không lấy trực tiếp màu feature để làm chữ nội dung.
2. Chữ thường phải đạt WCAG AA 4.5:1; chữ lớn tối thiểu 3:1; focus và thành phần UI tối thiểu 3:1 với vùng lân cận.
3. Màu feature chỉ dùng cho icon, chấm định vị, chart, viền hoặc tint nền 4-12%. Chữ trên tint dùng `text.strong`.
4. Không dùng màu là tín hiệu duy nhất. Success, warning và error phải có nhãn chữ hoặc icon kèm tên trạng thái.
5. `text.disabled` chỉ dùng cho control thực sự disabled; không dùng cho nội dung phụ cần đọc.
6. Gradient không phải nền cho đoạn văn dài. Nếu có chữ trên gradient, đặt chữ trong surface trắng hoặc kiểm tra tương phản tại điểm tối nhất/sáng nhất.

### 2.2 Màu cho background

| Vai trò | Token CSS | Giá trị | Dùng cho |
|---|---|---:|---|
| Canvas | `--ec-bg-canvas` | `#FFF9F1` | Nền mặc định của trang |
| Surface | `--ec-bg-surface` | `#FFFFFF` | Card, modal, input, chatbot |
| Subtle | `--ec-bg-subtle` | `#F6FAFC` | Khu vực phụ, table header, skeleton tĩnh |
| Inverse | `--ec-bg-inverse` | `#173B57` | Hero tối nhỏ, footer, CTA đậm |
| Brand soft | `--ec-bg-brand-soft` | `#EAF7FA` | Vùng giới thiệu hoặc selection nhẹ |
| Success soft | `--ec-bg-success-soft` | `#E8F4EE` | Thông báo thành công |
| Warning soft | `--ec-bg-warning-soft` | `#FFF4DF` | Cảnh báo không khẩn cấp |
| Danger soft | `--ec-bg-danger-soft` | `#FBEAEA` | Lỗi cần sửa |
| Overlay | `--ec-bg-overlay` | `rgba(23,59,87,.48)` | Scrim của modal/sheet |

### 2.3 Màu cho text

| Vai trò | Token CSS | Giá trị | Dùng cho |
|---|---|---:|---|
| Strong | `--ec-text-strong` | `#183247` | H1-H6, dữ liệu quan trọng, label mạnh |
| Default | `--ec-text-default` | `#2B4151` | Body, input value, nội dung card |
| Muted | `--ec-text-muted` | `#5C6F7D` | Metadata, mô tả phụ, timestamp |
| Inverse | `--ec-text-inverse` | `#FFFFFF` | Chữ trên `bg.inverse` hoặc nút Ocean 700 |
| Link | `--ec-text-link` | `#214F70` | Link và text action; luôn có underline hoặc dấu hiệu tương tác |
| Success | `--ec-text-success` | `#216A49` | Chữ trên `bg.successSoft` |
| Warning | `--ec-text-warning` | `#7A4B00` | Chữ trên `bg.warningSoft` |
| Danger | `--ec-text-danger` | `#9B3030` | Error message trên `bg.dangerSoft`/surface |
| Disabled | `--ec-text-disabled` | `#82919B` | Chỉ control disabled, kèm `disabled`/`aria-disabled` |

`text.muted` của v1.1 đổi từ `#667986` sang `#5C6F7D` để chữ phụ vẫn đạt AA trên nền kem `#FFF9F1`.

### 2.4 Cặp màu được phép

| Background | Text được phép | Ghi chú |
|---|---|---|
| Canvas / Surface / Subtle | Strong, Default, Muted, Link | Cặp mặc định cho phần lớn UI |
| Inverse / Ocean 900 / Ocean 700 | Inverse | Ocean 700 + trắng đạt AA cho chữ thường |
| Feature tint 4-12% | Strong hoặc Default | Không dùng feature 500 làm màu body text |
| Success soft | Success | Có icon/nhãn “Đã lưu”, “Hoàn tất”… |
| Warning soft | Warning | Không dùng warning cho chẩn đoán tâm lý |
| Danger soft / Surface | Danger | Giữ dữ liệu nhập và nêu cách sửa |

### 2.5 Cặp màu không được dùng

- `text.inverse` trên canvas, surface, tint vàng/peach/lavender nhạt.
- `text.muted` trên inverse hoặc trên ảnh/gradient.
- Màu feature 500 cho đoạn văn hoặc label nhỏ.
- Focus blue làm màu body text; `#245CFF` chỉ dành cho focus outline/ring.
- Red/danger làm nền toàn màn hình hoặc biểu thị mức độ sức khỏe tâm thần.

## 3. Responsive architecture

### Mobile: 0-767 px

- Một cột; padding ngang 16 px.
- Top brand bar 88 px để chứa logo 72 px và vùng đệm 8 px trên/dưới.
- Bottom navigation 68 px và có safe-area.
- Bottom navigation: Trang chủ, Nhật ký, Dashboard, Thư viện, Tất cả.
- Tất cả mở bottom sheet liệt kê Bài kiểm tra, Bài tập CBT, Music Hub, Confession và Trò chuyện AI với Meo.
- Touch target tối thiểu 44 x 44 px; body text tối thiểu 16 px.

### Tablet: 768-1023 px

- Grid 8 cột, gutter 20 px.
- Navigation rail thu gọn; nội dung 1-2 cột.
- Brand zone 136 px, logo 96 px, offset 20 px.

### Laptop: 1024-1279 px

- Grid 12 cột, gutter 24 px.
- Sidebar có thể thu gọn; không để content width xuống dưới mức đọc tốt.
- Brand zone trong sidebar 168 px; logo 120 px, offset 24 px.

### Desktop: >=1280 px

- Container tối đa 1200 px.
- Sidebar 248 px; action top bar 72 px.
- Dashboard tối đa 3 cột; các trang đọc dài tối đa 760 px.

## 4. Vị trí logo ExamCalm trong web app

### 4.1 Vị trí chuẩn

- Logo luôn nằm trong **brand zone ở góc trái trên cùng của app shell**.
- Desktop/laptop: logo nằm trong sidebar; `left: 24px`, `top: 24px`, rộng 120 px.
- Tablet: logo nằm đầu navigation rail; `left: 20px`, `top: 20px`, rộng 96 px.
- Mobile: logo nằm đầu top brand bar; `left: 16px`, `top: 8px`, rộng 72 px.
- Dùng nguyên file logo đầy đủ. Không crop, không kéo méo, không tách icon, không đổi màu và không thêm shadow.
- Logo không nằm trong card nội dung, không cuộn cùng feed nếu app shell đang cố định, không đổi vị trí giữa các trang cùng breakpoint.

### 4.2 Khoảng cách với heading

- Khi logo và heading ở **hai cột** (sidebar + main content), H1 căn theo content container; giữ tối thiểu 32 px từ mép sidebar đến cột nội dung.
- Khi logo và heading **xếp dọc cùng một cột** (auth, onboarding, mobile landing), khoảng trống từ đáy hộp logo đến đỉnh H1 là 32 px desktop, 28 px tablet, 24 px mobile.
- Khi logo và heading **cùng một hàng**, khoảng cách ngang tối thiểu 32 px; không dùng layout này dưới 768 px.
- Không đặt tagline hoặc breadcrumb chen vào clearspace của logo.
- Navigation bắt đầu sau brand zone: 168 px desktop, 136 px tablet, 96 px mobile.

### 4.3 Ngoại lệ

- Splash/loading có thể căn giữa logo; không có H1 cạnh logo.
- Bản in/marketing tiếp tục dùng minimum size của v1.0. Kích thước 72 px mobile là ngoại lệ đã phê duyệt riêng cho app shell.
- Nếu sau này có icon-only được phê duyệt, phải phát hành asset và token mới; không tự cắt từ logo hiện tại.

## 5. UI components

### Button

- Primary: Ocean 700, chữ trắng; cao 44-48 px; radius 12 px.
- Secondary: surface trắng, chữ Ocean 800, viền Ocean 500.
- Soft: tint theo tính năng 4-12%, chữ Strong.
- Hover: translateY(-1px) + card shadow, 120 ms.
- Pressed: scale(0.98), 120 ms.
- Disabled: dùng thuộc tính disabled, `text.disabled`; không chỉ giảm opacity hoặc chỉ dùng màu.

### Card

- Radius 16 px; padding 16-24 px.
- Card chính dùng surface trắng, text Default và shadow nhẹ.
- Card theo tính năng chỉ dùng tint 4-12%, text Strong/Default; không dùng viền đen nặng.
- Mỗi card ưu tiên heading, 1-2 dòng mô tả và CTA.

### Form

- Label luôn hiển thị; placeholder không thay label.
- Input cao tối thiểu 44 px; textarea tối thiểu 96 px.
- Focus: outline 2 px `#245CFF` + ring 3 px / 28%.
- Error giữ lại dữ liệu, giải thích bằng chữ và cung cấp cách sửa.
- Nhật ký phải nêu rõ dữ liệu riêng tư và phần nào có AI xử lý.

### Dashboard

- Không tạo điểm sức khỏe tâm thần tổng hợp, leaderboard hoặc streak.
- Chart ghi rõ nguồn là dữ liệu tự báo cáo.
- AI insight dùng ngôn ngữ tương quan: “có vẻ”, “trong những lần bạn ghi nhận”.
- Mỗi card trả lời một câu hỏi: đang ở đâu, vừa làm gì, có thể thử gì tiếp theo.

## 6. Hai vai trò tách biệt: mascot onboarding và chatbot

### 6.1 Interactive mascot — chủ động hướng dẫn người dùng mới

Mục tiêu: giúp người vừa tạo tài khoản hiểu navigation, tính năng chính và quyền riêng tư mà không cần tự hỏi.

- Trigger duy nhất: phiên đầu tiên sau khi tài khoản được tạo hoặc khi người dùng chủ động chọn “Xem lại hướng dẫn”.
- Chế độ: **proactive**. Meo có thể xuất hiện trước khi người dùng đặt câu hỏi.
- Hình thức: Meo + coach mark + nút Tiếp theo/Bỏ qua; không có ô nhập chat.
- Tối đa 5 bước cho lần đầu: Trang chủ → Nhật ký cảm xúc → Dashboard → Thư viện → nút “Hỏi về web app”.
- Mỗi bước nêu một lợi ích và một hành động; không mô tả toàn bộ sản phẩm trong một bubble.
- Luôn có “Bỏ qua” và “Để sau”; lưu tiến độ; không bắt người dùng hoàn tất mới dùng được app.
- Sau khi completed/dismissed, không tự chạy lại. Có thể mở lại từ Trợ giúp/Cài đặt.
- Mascot không trả lời câu hỏi tự do, không giả làm chatbot và không tự đưa lời khuyên tâm lý.

### 6.2 Chatbot — phản hồi khi người dùng hỏi về web app

Mục tiêu: trả lời câu hỏi sử dụng sản phẩm khi người dùng chủ động mở và gửi câu hỏi.

- Entry label: **Hỏi về web app**. Có thể dùng hình Meo nhưng phải có nhãn chữ, không chỉ dùng icon.
- Chế độ: **reactive**. Không tự mở panel, không tự gửi lời chào che nội dung và không khởi động onboarding.
- Phạm vi: navigation, cách dùng tính năng, tài khoản, cài đặt, quyền riêng tư, dữ liệu và xử lý lỗi trong web app.
- Trả lời ngắn; ưu tiên deep link hoặc CTA tới đúng màn hình.
- Nếu câu hỏi ngoài phạm vi, nói rõ chatbot hỗ trợ cách dùng ExamCalm và gợi ý tính năng phù hợp; không bịa chức năng.
- Không chẩn đoán, không thay chuyên gia, không trình bày nội dung AI như chỉ định y tế.
- Mọi câu trả lời AI phải cho phép feedback, đóng panel và xoá lịch sử theo chính sách sản phẩm.

### 6.3 Không trộn hai vai trò

| Tình huống | Interactive mascot | Chatbot |
|---|---|---|
| Người dùng vừa tạo tài khoản | Tự bắt đầu nếu chưa từng xem | Chỉ hiển thị launcher |
| Người dùng hỏi “Nhật ký ở đâu?” | Không đổi thành chat | Trả lời và dẫn tới Nhật ký |
| Người dùng bỏ qua tour | Lưu dismissed | Không tự bật |
| Người dùng chọn “Xem lại hướng dẫn” | Chạy lại tour | Giữ panel đóng |
| Câu hỏi ngoài web app | Không xử lý | Nêu giới hạn và điều hướng an toàn |

### 6.4 State và event triển khai

**Mascot onboarding states**

- `not_started`: tài khoản mới, chưa hiện bước 1.
- `active`: đang ở một coach mark.
- `paused`: chọn Để sau; lưu `currentStep`.
- `dismissed`: chọn Bỏ qua; không tự chạy lại.
- `completed`: hoàn tất; không tự chạy lại.

**Events tối thiểu**

- `onboarding_guide_started`
- `onboarding_guide_step_viewed`
- `onboarding_guide_paused`
- `onboarding_guide_dismissed`
- `onboarding_guide_completed`
- `webapp_chatbot_opened`
- `webapp_chatbot_question_sent`
- `webapp_chatbot_answer_feedback`

Không ghi nội dung riêng tư của Nhật ký vào analytics của tour/chatbot.

## 7. Motion tokens

| Token | Giá trị | Dùng cho |
|---|---:|---|
| instant | 80 ms | Reduced motion, phản hồi tức thời |
| fast | 120 ms | Hover, pressed, chip |
| base | 180 ms | Card, accordion, modal element |
| page | 240 ms | Page enter |
| expressive | 420 ms | Meo hoặc success nhỏ |
| stagger | 60 ms | Heading → body → card |

- Standard easing: `cubic-bezier(.2, 0, 0, 1)`.
- Enter easing: `cubic-bezier(0, 0, .2, 1)`.
- Exit easing: `cubic-bezier(.4, 0, 1, 1)`.
- Gentle pop chỉ dành cho mood icon hoặc Meo: `cubic-bezier(.34, 1.3, .64, 1)`.

## 8. Page transition và microinteractions

1. Trang cũ giảm opacity trong 120 ms; không đẩy ngang toàn màn hình.
2. Trang mới bắt đầu ở opacity 0 và translateY(10px).
3. Heading xuất hiện trước; body và card stagger 60 ms.
4. Hoàn tất trong 240 ms; người dùng có thể tương tác ngay.
5. Reduced motion: opacity-only 80 ms, không translate, scale hoặc parallax.

- Button: hover nâng 1 px; press scale 0.98.
- Card: hover nâng 2 px trên desktop; mobile không phụ thuộc hover.
- Mood icon: gentle pop 420 ms một lần khi chọn.
- Test progress: width transition 180 ms; không chạy lại khi scroll.
- Kết quả Test: heading → diễn giải → CTA; không flash đỏ hoặc confetti.
- Nhật ký lưu thành công: leaf/check 420 ms; thông báo “Đã lưu”.
- CBT: chuyển bước fade + translate 8 px; giữ dữ liệu khi quay lại.
- Music Hub: waveform chỉ chạy khi phát; không autoplay.
- Confession: submit → moderation status rõ; không mô phỏng “đã public” trước khi moderation hoàn tất.
- Error: không rung mạnh; highlight nhẹ và focus trường lỗi đầu tiên.

## 9. Motion của Meo trong onboarding

- Bước đầu: wave/pop một lần, 420-700 ms; sau đó đứng yên.
- Chuyển coach mark: bubble fade + translate 8 px trong 180 ms; Meo không bay xuyên màn hình.
- Không pulse vô hạn để kéo sự chú ý.
- Tối đa hai chu kỳ idle; pause khi tab ẩn, out of viewport hoặc tour paused.
- Không di chuyển focus tự động vào mascot. Coach mark dùng `aria-live="polite"` hoặc dialog được quản lý focus khi thật sự modal.
- Reduced motion: Meo tĩnh; coach mark opacity-only 80 ms.

## 10. Motion của chatbot

- Launcher không bounce/pulse lặp. Có thể dùng badge tĩnh khi có thông báo hệ thống thật.
- Panel enter: fade + translateY(8px), 180 ms; panel exit 120 ms.
- “Đang trả lời” dùng ba chấm nhẹ hoặc skeleton; không dùng Meo chạy vòng lặp vô hạn.
- Khi chatbot mở, focus vào heading hoặc input theo ngữ cảnh; khi đóng, trả focus về launcher.
- Chỉ một bề mặt mở rộng tại một thời điểm: coach mark và chatbot panel không chồng lên nhau.

## 11. Accessibility và safety

- WCAG AA; chữ thường tối thiểu 4.5:1.
- Keyboard và focus đầy đủ; semantic HTML; label rõ.
- `prefers-reduced-motion` là bắt buộc.
- Không dùng animation nhấp nháy, rung hoặc pulse vô hạn.
- Không dùng màu, biểu đồ hoặc motion để tạo cảm giác chẩn đoán.
- AI là trợ lý, không phải thẩm quyền; người dùng được bỏ qua, sửa hoặc xoá nội dung AI.
- Tour không được che CTA quan trọng, input, nút lưu hoặc bottom navigation.
- Launcher chatbot tối thiểu 44 x 44 px và có accessible name “Hỏi về web app”.

## 12. Acceptance criteria cho code và QA

### Màu

- Không còn hard-code màu text/background ngoài token file, trừ asset đã phê duyệt.
- Snapshot test có đủ canvas, surface, inverse, success, warning và error.
- `text.muted` hiển thị `#5C6F7D`; không còn `#667986` trong component mới.
- Contrast được test ở 320, 768, 1024 và 1440 px.

### Logo

- Logo ở góc trái trên cùng trên mọi route sau đăng nhập.
- Kích thước/offset đúng breakpoint; không layout shift khi đổi route.
- H1 không xâm phạm clearspace; auth/onboarding giữ gap 32/28/24 px.
- Logo không bị crop, méo hoặc biến thành icon-only.

### Mascot onboarding

- Chỉ auto-start cho tài khoản mới chưa có trạng thái tour.
- Có Bỏ qua/Để sau; lưu và phục hồi `currentStep`.
- Completed/dismissed không tự chạy lại.
- Không có ô nhập câu hỏi trong coach mark.

### Chatbot

- Chỉ mở sau user action.
- Entry có nhãn “Hỏi về web app”.
- Trả lời nằm trong phạm vi sử dụng ExamCalm và có link/CTA khi phù hợp.
- Không tự khởi động tour, không che mascot tour và không xử lý như chuyên gia tâm lý.

## 13. Thứ tự triển khai

1. Migrate color token semantic và kiểm tra contrast.
2. Cập nhật app shell/brand zone/logo ở các breakpoint.
3. Xây state machine cho onboarding mascot và lưu trạng thái.
4. Xây chatbot reactive “Hỏi về web app” và giới hạn phạm vi.
5. QA responsive, keyboard, reduced motion, analytics không chứa dữ liệu Nhật ký.
6. Tiếp tục roadmap v1.0 cho các màn hình/tính năng còn lại; Góc Cây Bình Yên vẫn pending.
