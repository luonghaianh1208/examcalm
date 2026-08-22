const STORAGE_KEY = "examcalm:guest-results";

export type GuestTestResult = {
  testId: string;
  testVersion: number;
  answers: Record<string, number>;
  score: number;
  level: string;
  completedAt: string;
};

type GuestResultMap = Record<string, GuestTestResult>;

function readAll(): GuestResultMap {
  if (typeof sessionStorage === "undefined") return {};
  try {
    // getItem cũng có thể ném lỗi (vd: Safari private browsing) — gộp chung
    // vào try/catch với JSON.parse để không sót trường hợp nào.
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as GuestResultMap) : {};
  } catch {
    return {};
  }
}

/** Guest KHÔNG ghi Firestore (spec §7.1) — kết quả chỉ sống trong phiên trình duyệt. */
export function saveGuestResult(result: GuestTestResult): void {
  if (typeof sessionStorage === "undefined") return;
  const all = readAll();
  all[result.testId] = result;
  try {
    // setItem có thể ném lỗi đồng bộ (hết quota, hoặc Safari private browsing
    // cho API tồn tại nhưng ghi thì lỗi). Lỗi này xảy ra ngay trong click
    // handler nộp bài — nếu để lọt ra ngoài, màn hình kết quả sẽ trắng trang
    // ngay sau khi học sinh vừa làm xong bài test lo âu. Mất bản lưu tạm còn
    // hơn mất cả màn hình, nên nuốt lỗi ở đây.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // im lặng — xem comment ở trên.
  }
}

export function loadGuestResult(testId: string): GuestTestResult | null {
  return readAll()[testId] ?? null;
}

export function clearGuestResults(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // im lặng — cùng lý do với saveGuestResult.
  }
}
