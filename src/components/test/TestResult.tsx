import Link from "next/link";
import type { CompletedTest } from "./TestRunner";

type Props = {
  result: CompletedTest;
  disclaimer: string;
  isSampleContent: boolean;
  /** Guest thấy CTA đăng ký; Student thấy thông báo đã lưu. */
  isSignedIn: boolean;
  /** id của doc testAttempts đã lưu; null nếu chưa/không lưu. */
  savedAttemptId?: string | null;
};

export function TestResult({ result, disclaimer, isSampleContent, isSignedIn, savedAttemptId }: Props) {
  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl bg-teal-50 px-5 py-6">
        <p className="text-slate-600">Tổng điểm của bạn</p>
        <p className="text-4xl font-semibold text-teal-800">{result.score}</p>
        <p className="mt-3 text-slate-800">{result.interpretation}</p>
      </div>

      {isSampleContent && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          Đây là <strong>nội dung mẫu chưa thẩm định</strong>. Đừng dùng kết quả này để đánh giá bản thân.
        </p>
      )}

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-slate-700">{disclaimer}</p>

      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Bạn có thể làm gì tiếp</h2>
        <Link href="/thu-vien" className="rounded-lg border px-4 py-3">
          Đọc thư viện kỹ thuật thư giãn
        </Link>
        {!isSignedIn && (
          <Link href="/dang-ky" className="rounded-lg bg-teal-600 px-4 py-3 text-center font-medium text-white">
            Đăng ký để lưu kết quả và xem thay đổi theo thời gian
          </Link>
        )}
        {isSignedIn && savedAttemptId && (
          <p className="text-slate-600">Kết quả đã được lưu vào trang Tiến trình của bạn.</p>
        )}
      </div>
    </section>
  );
}
