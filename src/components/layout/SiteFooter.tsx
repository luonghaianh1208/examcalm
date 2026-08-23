/**
 * Footer nhỏ, hiển thị trên MỌI trang (I7 — an toàn trẻ em). Bài GAD-7 mức nặng
 * (15–21 điểm) đã nhắc học sinh nói với người lớn tin tưởng, nhưng không phải
 * lúc nào cũng có sẵn ai đó ngay lúc cần — số 111 là một cánh cửa luôn mở, kể
 * cả với học sinh KHÔNG làm bài test. Cố tình để nhỏ, không phải banner: một
 * học sinh đang gặp khó khăn cần tìm thấy được, còn phần lớn học sinh khác
 * không cần bị nhắc liên tục về điều này ở mọi trang.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t px-4 py-3 text-center text-xs text-slate-500">
      <p>
        Cần ai đó lắng nghe ngay bây giờ? Tổng đài Quốc gia Bảo vệ Trẻ em —{" "}
        <a href="tel:111" className="font-medium text-teal-700 underline">
          111
        </a>{" "}
        — miễn phí, hoạt động 24/7.
      </p>
    </footer>
  );
}
