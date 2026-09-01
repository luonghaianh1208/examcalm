import { CatMascot } from "@/components/mascot/CatMascot";

export const metadata = { title: "Giới thiệu" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[760px] py-10">
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

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Trò chuyện cùng mèo</h2>
        {/* I3 (final whole-branch review): trước fix, đoạn này nói "riêng tư" rồi liệt kê cảnh
            báo an toàn là "Ngoại lệ duy nhất" — một học sinh đọc câu đó dễ hiểu nhầm là chữ
            mình gõ không rời khỏi hệ thống. Sự thật: MỖI tin nhắn đều được gửi ra một dịch vụ AI
            bên ngoài để tạo câu trả lời. "Riêng tư" ở đây chỉ có nghĩa quản trị viên không đọc
            được — hai điều khác nhau, phải nói tách bạch. */}
        <p className="text-slate-700">
          Nếu trường bạn đã bật tính năng này và bạn đồng ý dùng, bạn có thể gõ chuyện với chú
          mèo đồng hành. <strong>Mỗi tin nhắn bạn gõ được gửi tới một dịch vụ AI bên ngoài</strong>{" "}
          để tạo câu trả lời — màn hình trò chuyện luôn nhắc lại điều này. Quản trị viên (giáo
          viên phụ trách) <strong>không đọc được nội dung bạn gõ</strong>.{" "}
          <strong>Ngoại lệ duy nhất ở phía quản trị viên:</strong> nếu bạn nói điều gì khiến hệ
          thống lo cho sự an toàn của bạn, thầy cô phụ trách sẽ được báo để đến hỏi thăm bạn —
          báo này <strong>không</strong> kèm theo nguyên văn bạn đã viết, chỉ đủ để thầy cô biết
          cần gặp ai và mức độ khẩn cấp. Điều này luôn được nhắc lại ngay trên màn hình trò
          chuyện, trước khi bạn gõ chữ đầu tiên, để bạn biết trước chứ không phát hiện sau lưng
          mình. Bạn xóa được từng tin nhắn hoặc cả cuộc trò chuyện bất cứ lúc nào.
        </p>
      </section>

      <section className="flex items-center gap-4 rounded-xl bg-white px-4 py-4">
        <CatMascot size={72} expression="listen" />
        <p className="text-slate-700">
          Bạn mèo đồng hành xuất hiện ở góc màn hình. Bấm vào để ghi lại cảm xúc bất cứ lúc nào.
        </p>
      </section>
    </div>
  );
}
