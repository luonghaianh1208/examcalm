/**
 * Cấu hình điều hướng — nguồn sự thật duy nhất cho sidebar, rail và bottom nav.
 *
 * Danh sách và thứ tự lấy từ Brand Guideline v1.1 trang 12. Tên hiển thị lấy
 * nguyên văn từ mục 1 của motion spec ("Giữ nguyên tên tính năng... không sáng
 * tạo tên mới") — đừng đổi chữ ở đây mà không sửa guideline trước.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Class màu tính năng cho chấm định vị. Guideline mục 2.1: màu tính năng
   *  chỉ dùng cho icon/chấm/chart/viền, không bao giờ làm màu chữ. */
  dot: string;
  /** Trang chưa xây. Hiện nhãn "Sắp ra mắt" và KHÔNG phải link — guideline
   *  trang 12 đã có tiền lệ này với Góc Cây Bình Yên. */
  comingSoon?: boolean;
  /** Chỉ hiện khi đã đăng nhập.
   *
   *  Vì sao không hiện cho khách: phản hồi 5.5 của học sinh là "trang chủ nói
   *  không cần tài khoản nhưng mở Nhật ký lại bị chặn ngay". Hiện link rồi đá
   *  về trang đăng nhập làm đúng cái đó tệ thêm. Gói C sẽ mở quyền cho khách
   *  dùng thử tử tế, lúc đó cờ này được xem lại. */
  authOnly?: boolean;
  /** Nằm trên bottom nav mobile. Guideline trang 12 cho đúng 4 mục + "Tất cả". */
  primary?: boolean;
  /** So khớp tuyệt đối thay vì theo tiền tố.
   *
   *  Bắt buộc cho mục là TỔ TIÊN của mục khác ("/" và "/admin"). Không có cờ
   *  này thì "/admin" sáng trên cả /admin/canh-bao, /admin/tests... vì mọi
   *  đường dẫn con đều bắt đầu bằng nó. */
  exact?: boolean;
  /** Nhãn nhóm. Các mục liền nhau cùng nhãn được gom dưới một tiêu đề nhỏ.
   *  Chỉ khu quản trị dùng: menu học sinh theo guideline là một danh sách
   *  phẳng, còn menu quản trị nhóm theo MỨC KHẨN vì chỉ cảnh báo an toàn mới
   *  có thể gấp, mọi mục còn lại đều hoãn được. */
  group?: string;
  /** Mốc neo cho tour onboarding (`data-tour="..."`).
   *
   *  BẮT BUỘC giữ khi đổi menu: OnboardingTour tìm mốc bằng querySelector, ba
   *  bước test/library/progress trước đây neo vào SiteHeader cũ. Bỏ đi thì tour
   *  vẫn chạy (nó xử lý được trường hợp thiếu mốc) nhưng bong bóng hướng dẫn
   *  mất vị trí, không còn chỉ vào đâu cả. */
  tour?: string;
};

export const STUDENT_NAV: NavItem[] = [
  { href: "/", label: "Trang chủ", dot: "bg-feature-ai", primary: true, exact: true },
  { href: "/nhat-ky", label: "Nhật ký cảm xúc", dot: "bg-feature-journal", authOnly: true, primary: true },
  // Route vẫn là /tien-trinh; gói B dựng lại trang này thành báo cáo cá nhân
  // hoá và mới đổi route. Nhãn đổi trước vì guideline gọi nó là Dashboard.
  { href: "/tien-trinh", label: "Dashboard", dot: "bg-feature-test", authOnly: true, primary: true, tour: "progress" },
  { href: "/thu-vien", label: "Thư viện", dot: "bg-feature-library", primary: true, tour: "library" },
  { href: "/test", label: "Bài kiểm tra", dot: "bg-feature-test", tour: "test" },
  { href: "/cbt", label: "Bài tập CBT", dot: "bg-feature-cbt" },
  { href: "/music", label: "Music Hub", dot: "bg-feature-music", comingSoon: true },
  { href: "/confession", label: "Confession", dot: "bg-feature-confession", comingSoon: true },
  { href: "/tro-chuyen", label: "Trò chuyện AI với Meo", dot: "bg-feature-ai", authOnly: true },
  // "Đã lưu" sẽ thành chip lọc trong Thư viện ở gói B (quyết định 2a). Giữ ở
  // đây tới lúc đó: bỏ ngay bây giờ thì nút tim lưu được mà không xem lại
  // được — đúng lỗi vừa sửa xong tuần trước.
  { href: "/da-luu", label: "Đã lưu", dot: "bg-feature-library", authOnly: true },
];

/**
 * Menu quản trị. Nhóm theo MỨC KHẨN chứ không theo loại dữ liệu — cảnh báo an
 * toàn là việc duy nhất ở khu quản trị có thể gấp.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Tổng quan", dot: "bg-feature-ai", exact: true },
  { href: "/admin/canh-bao", label: "Cảnh báo an toàn", dot: "bg-danger", group: "An toàn" },
  { href: "/admin/tests", label: "Bài test", dot: "bg-feature-test", group: "Nội dung" },
  { href: "/admin/cbt", label: "Bài tập CBT", dot: "bg-feature-cbt", group: "Nội dung" },
  { href: "/admin/thu-vien", label: "Thư viện", dot: "bg-feature-library", group: "Nội dung" },
  { href: "/admin/nguoi-dung", label: "Người dùng", dot: "bg-feature-music", group: "Hệ thống" },
  { href: "/admin/ai", label: "Cấu hình AI", dot: "bg-feature-ai", group: "Hệ thống" },
  { href: "/admin/nhat-ky-he-thong", label: "Nhật ký hệ thống", dot: "bg-feature-cbt", group: "Hệ thống" },
];

/** Lọc theo trạng thái đăng nhập. */
export function visibleNav(items: NavItem[], signedIn: boolean): NavItem[] {
  return items.filter((i) => !i.authOnly || signedIn);
}

/** Trang đang mở? Xem chú thích của cờ `exact`. */
export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
