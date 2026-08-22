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
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
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
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadGuestResult(testId: string): GuestTestResult | null {
  return readAll()[testId] ?? null;
}

export function clearGuestResults(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
