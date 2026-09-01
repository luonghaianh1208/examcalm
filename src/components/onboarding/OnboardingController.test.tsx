import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { OnboardingController } from "./OnboardingController";
import { getOnboarding, markWelcomeSeen } from "@/lib/firestore/onboarding";
import type { SessionUser } from "@/lib/firebase/session";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/lib/firestore/onboarding", () => ({
  getOnboarding: vi.fn(),
  markWelcomeSeen: vi.fn().mockResolvedValue(undefined),
  setHideTooltips: vi.fn().mockResolvedValue(undefined),
}));

const mockedUsePathname = vi.mocked(usePathname);
const mockedGetOnboarding = vi.mocked(getOnboarding);

const STUDENT: SessionUser = { uid: "u1", email: "a@b.com", emailVerified: true, role: "student" };
const ADMIN: SessionUser = { uid: "a1", email: "a@b.com", emailVerified: true, role: "admin" };
const UNVERIFIED: SessionUser = { uid: "u2", email: "a@b.com", emailVerified: false, role: "student" };

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePathname.mockReturnValue("/");
  mockedGetOnboarding.mockResolvedValue({ welcomeSeenAt: null, hideTooltips: false, guideStatus: "not_started" as const, guideStep: 0 });
});

describe("OnboardingController — điều kiện hiển thị", () => {
  it("Guest (user=null) -> không render gì", async () => {
    render(<OnboardingController user={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  it("admin -> không bao giờ hiện onboarding, kể cả ở trang không phải /admin", async () => {
    render(<OnboardingController user={ADMIN} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  it("học sinh CHƯA xác thực email -> không hiện", async () => {
    render(<OnboardingController user={UNVERIFIED} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  it("trang /admin/... -> không hiện dù user là học sinh đã xác thực", async () => {
    mockedUsePathname.mockReturnValue("/admin/nguoi-dung");
    render(<OnboardingController user={STUDENT} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  it("đang làm bài test (/test/xyz) -> không hiện", async () => {
    mockedUsePathname.mockReturnValue("/test/xyz123");
    render(<OnboardingController user={STUDENT} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  it("trang danh sách /test (không phải mid-test) -> vẫn hiện bình thường", async () => {
    mockedUsePathname.mockReturnValue("/test");
    render(<OnboardingController user={STUDENT} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("OnboardingController — welcome dialog rồi tới tour", () => {
  it("welcomeSeenAt=null -> hiện WelcomeDialog trước", async () => {
    render(<OnboardingController user={STUDENT} />);
    expect(await screen.findByRole("heading", { name: /chào mừng/i })).toBeInTheDocument();
  });

  it("đã thấy welcome, chưa ẩn tour -> hiện OnboardingTour thẳng", async () => {
    mockedGetOnboarding.mockResolvedValue({ welcomeSeenAt: new Date(), hideTooltips: false, guideStatus: "not_started" as const, guideStep: 0 });
    render(<OnboardingController user={STUDENT} />);
    expect(await screen.findByRole("dialog", { name: /hướng dẫn sử dụng/i })).toBeInTheDocument();
  });

  it("đã tick 'không hiện lại' (hideTooltips=true) -> không hiện gì kể cả sau khi đã thấy welcome", async () => {
    mockedGetOnboarding.mockResolvedValue({ welcomeSeenAt: new Date(), hideTooltips: true, guideStatus: "not_started" as const, guideStep: 0 });
    render(<OnboardingController user={STUDENT} />);
    // Chờ getOnboarding() resolve xong rồi mới khẳng định KHÔNG có gì — nếu
    // assert ngay, test có thể pass "giả" chỉ vì promise chưa kịp resolve.
    await vi.waitFor(() => expect(getOnboarding).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("đóng WelcomeDialog -> ghi welcomeSeenAt và chuyển sang tour ngay (không cần tải lại)", async () => {
    const user = userEvent.setup();
    render(<OnboardingController user={STUDENT} />);

    await user.click(await screen.findByRole("button", { name: /bắt đầu khám phá/i }));

    expect(markWelcomeSeen).toHaveBeenCalledWith("u1");
    expect(await screen.findByRole("dialog", { name: /hướng dẫn sử dụng/i })).toBeInTheDocument();
  });
});
