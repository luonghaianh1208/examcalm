EXAMCALM — GÓC CÂY BÌNH YÊN
GAME ASSET PACK v1.0

Bộ asset được xây dựng theo Mini-GDD Góc Cây Bình Yên v1.0 và PRD ExamCalm v2.0.
Tổng cộng: 60 file PNG + 01 bảng kê ASSET_MANIFEST.csv.

1. CẤU TRÚC THƯ MỤC

01_Trees
  05 giai đoạn phát triển của cùng một cây:
  - Stage 1: Mầm nhỏ, 0–29 Growth XP.
  - Stage 2: Cây non, 30–79 Growth XP.
  - Stage 3: Tán lá, 80–159 Growth XP.
  - Stage 4: Ra nụ, 160–279 Growth XP.
  - Stage 5: Cây trưởng thành, từ 280 Growth XP.

02_Care_Items
  - Giọt nước: giá khởi tạo 8 Điểm Mầm, +5 Growth XP.
  - Nắng trong lọ: giá khởi tạo 15 Điểm Mầm, +10 Growth XP.
  - Đất dinh dưỡng: giá khởi tạo 25 Điểm Mầm, +18 Growth XP.
  - Chuông gió dịu: giá khởi tạo 20 Điểm Mầm, +12 Growth XP.

03_Decorations
  15 đồ trang trí tách rời: cụm hoa, đá cuội, đèn lồng, thảm Meo,
  ghế gỗ, bàn trà, cụm nấm, hàng rào, dây đèn sao, hồ nước nhỏ,
  bảng gỗ trống, gối mây, cối xay gió mini, giỏ len và giàn hoa leo.

04_Backgrounds
  - Active Morning: nền mặc định ban ngày.
  - Phông chiều dịu: nền trang trí mở khóa/mua trong cửa hàng.
  - Sleeping Night: nền trạng thái ngủ tích cực sau thời gian vắng mặt.

05_UI_Icons
  14 icon đồng bộ cho Điểm Mầm, Growth XP, nhận điểm, chăm sóc,
  cửa hàng, kho đồ, trang trí, lưu, hủy, đặt lại, khóa, mở khóa mới,
  âm thanh và reduced motion.

06_VFX_Overlays
  09 lớp hiệu ứng PNG trong suốt: giọt nước, tia nắng, mầm sáng,
  gió nhẹ, lá rung, stage-up, wake-up, đom đóm và hạt sáng ngủ.

07_Meo_Mascot
  07 trạng thái Meo đã tách nền: hình chính, chào mừng, lắng nghe,
  khích lệ, nghỉ ngơi, tưới cây và avatar Mood Journal.

08_Scene_Previews
  03 ảnh ghép tham khảo: Active Morning, Sleeping Night và Wake-up.
  Đây là preview bố cục; lập trình viên nên dựng scene thật bằng layer.

2. ĐỊNH DẠNG

- Cây, vật phẩm, đồ trang trí, icon, VFX và Meo: PNG RGBA nền trong suốt.
- Phông nền và ảnh preview: PNG RGB nền đầy đủ.
- Asset tạo bằng hình ảnh có canvas 1254 x 1254 px, trừ phông nền dọc.
- UI icon: 512 x 512 px.
- VFX overlay: 1024 x 1024 px.

3. GỢI Ý TÍCH HỢP

- Dùng object-fit: contain để không cắt vật phẩm.
- Scene nên được dựng bằng layer theo thứ tự: background → decor phía sau
  → cây → decor phía trước → Meo → VFX → UI.
- Với mobile, dùng slot-based placement trước; không nên cho kéo vật phẩm
  ra khỏi safe area hoặc che toàn bộ cây/Meo.
- Sleeping chỉ đổi phông nền/ánh sáng và thêm VFX; không thay đổi cây,
  Growth XP, inventory hay layout.
- Wake-up có thể dùng 07_VFX_Wake_Up.png trong tối đa 3 giây và cho phép skip.
- Khi reduced motion bật, thay animation bằng fade ngắn hoặc trạng thái tĩnh.
- Bảng gỗ được để trống có chủ đích để UI chèn nội dung động, không ghi chữ
  trực tiếp vào ảnh.

4. LƯU Ý SẢN PHẨM

Tất cả giá, Growth XP và ngưỡng stage là cấu hình khởi tạo từ Mini-GDD,
cần playtest trước production. Không dùng asset để thể hiện cây héo, cây chết,
mất tiến trình, streak hoặc lời nhắc gây tội lỗi cho người dùng.
