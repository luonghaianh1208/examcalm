import Link from "next/link";

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
      {/* Trang /gioi-thieu trước đây KHÔNG có link nào trỏ tới từ bất cứ đâu trong
          app — chỉ vào được bằng cách gõ thẳng URL. Đó là nơi duy nhất giải thích
          ExamCalm không phải gì, dữ liệu đi đâu, và khi nào thầy cô được báo, nên
          nó phải có mặt trên mọi trang. Để nhẹ hơn số 111 vì 111 mới là đường
          khẩn cấp. */}
      <p className="mt-1.5">
        <Link href="/gioi-thieu" className="underline">
          Về ExamCalm và dữ liệu của bạn
        </Link>
      </p>
    </footer>
  );
}
