/**
 * Sinh id cho mục MỚI trong một danh sách, không bao giờ đánh số lại mục cũ
 * và không tái dùng id đã bị xoá.
 *
 * Bài làm của học sinh được lưu dưới dạng record khoá theo id — câu trả lời
 * CBT ở `cbtSessions.answers` và đáp án bài test ở `testAnswers.answers`. Nếu
 * một id bị tái dùng cho mục khác, dữ liệu cũ sẽ trỏ sang mục sai mà không có
 * lỗi nào hiện ra.
 */
export function nextItemId(prefix: string, existing: string[]): string {
  const used = new Set(existing);
  let n = existing.length + 1;
  while (used.has(prefix + n)) n += 1;
  return prefix + n;
}
