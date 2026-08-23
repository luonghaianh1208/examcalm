import { CatMascot } from "@/components/mascot/CatMascot";

export const metadata = { title: "Giới thiệu" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Về ExamCalm</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">ExamCalm là gì</h2>
        <p className="text-slate-700">
          Một trang web giúp học sinh THPT hiểu hơn trạng thái cảm xúc của mình trước kỳ thi
          và chủ động chọn một hoạt động phù hợp để điều chỉnh tâm trạng.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">ExamCalm không phải là gì</h2>
        <ul className="list-disc pl-5 text-slate-700">
          <li>Không phải công cụ chẩn đoán y khoa hay tâm lý.</li>
          <li>Không thay thế việc gặp chuyên gia.</li>
          <li>Không xếp hạng hay so sánh sức khỏe tinh thần giữa các bạn.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Dữ liệu của bạn</h2>
        <p className="text-slate-700">
          Nhật ký cảm xúc <strong>hoàn toàn riêng tư</strong> — quản trị viên (giáo viên
          phụ trách) không bao giờ đọc được nội dung bạn ghi. Với bài test, quản trị viên
          xem được <strong>điểm số và mức độ</strong> để kịp thời hỏi thăm khi bạn cần hỗ
          trợ, nhưng <strong>không xem được bạn đã chọn đáp án nào</strong> ở từng câu. Bạn
          xóa được từng ghi chép, hoặc xóa toàn bộ dữ liệu bất cứ lúc nào ở trang Hồ sơ.
        </p>
      </section>

      <section className="flex items-center gap-4 rounded-xl bg-white px-4 py-4">
        <CatMascot size={72} expression="listen" />
        <p className="text-slate-700">
          Bạn mèo đồng hành xuất hiện ở góc màn hình. Bấm vào để ghi lại cảm xúc bất cứ lúc nào.
        </p>
      </section>
    </main>
  );
}
