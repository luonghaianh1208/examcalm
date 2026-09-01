import { requireUser } from "@/lib/firebase/session";
import { ProgressView } from "@/components/progress/ProgressView";

export const metadata = { title: "Tiến trình" };

export default async function Page() {
  const user = await requireUser();
  return (
    // Dashboard dùng cả bề rộng (guideline: dashboard tối đa 3 cột), không bó
    // vào cột đọc 760px như các trang bài viết.
    //
    // Tiêu đề và câu ranh giới ("không xếp hạng, không chẩn đoán") nằm TRONG
    // ProgressView chứ không ở đây: đặt cả hai nơi sẽ thành hai <h1> trên cùng
    // một trang.
    <div className="py-8">
      <ProgressView uid={user.uid} />
    </div>
  );
}
