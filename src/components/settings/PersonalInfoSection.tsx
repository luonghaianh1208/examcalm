/**
 * Thông tin cá nhân học sinh đã điền lúc tạo tài khoản — phản hồi 6.4.
 *
 * Chỉ ĐỌC, chưa cho sửa. Lý do: nickname/khối lớp/trường được các màn hình
 * quản trị và mail cảnh báo khủng hoảng dùng để nhận diện học sinh, nên cho
 * sửa tự do cần thêm một vòng nghĩ về việc ai được đổi gì và ghi vết ra sao.
 * Ở bước này việc cần làm là để học sinh THẤY được dữ liệu của mình — đúng
 * điều họ yêu cầu — chứ không phải mở luôn quyền sửa.
 *
 * Server Component: dữ liệu đã có sẵn ở trang cha, không cần tải lại ở client.
 */
export function PersonalInfoSection({
  email,
  nickname,
  gradeLevel,
  school,
  examGoals,
}: {
  email: string | null;
  nickname: string;
  gradeLevel: string;
  school: string;
  examGoals: string[];
}) {
  // Trường trống hiện "Chưa có" thay vì để khoảng trắng — dòng trống trông
  // như lỗi tải dữ liệu.
  const hienThi = (v: string) => (v.trim() === "" ? "Chưa có" : v);

  const muc: Array<[string, string]> = [
    ["Email", email ?? "Chưa có"],
    ["Biệt danh", hienThi(nickname)],
    ["Khối lớp", gradeLevel.trim() === "" ? "Chưa có" : `Lớp ${gradeLevel}`],
    ["Trường", hienThi(school)],
    ["Mục tiêu thi", examGoals.length > 0 ? examGoals.join(", ") : "Chưa có"],
  ];

  return (
    <section className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4">
      <h2 className="mb-1 font-medium text-ink">Thông tin của bạn</h2>
      <p className="mb-4 text-sm text-muted">
        Đây là những gì bạn đã điền khi tạo tài khoản. Muốn sửa thì nhắn thầy cô phụ trách.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {muc.map(([nhan, giaTri]) => (
          <div key={nhan}>
            <dt className="text-sm text-muted">{nhan}</dt>
            <dd className="text-body">{giaTri}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
