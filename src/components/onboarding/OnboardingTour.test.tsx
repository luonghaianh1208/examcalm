import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingTour } from "./OnboardingTour";
import { setGuideProgress } from "@/lib/firestore/onboarding";

vi.mock("@/lib/firestore/onboarding", () => ({
  setGuideProgress: vi.fn().mockResolvedValue(undefined),
  setHideTooltips: vi.fn().mockResolvedValue(undefined),
}));

const mockedSetGuideProgress = vi.mocked(setGuideProgress);

/** Năm anchor thật mà tour sẽ đo vị trí — không có thì reposition() chỉ bỏ qua styling. */
function renderAnchors() {
  document.body.innerHTML = `
    <a data-tour="home" href="/">Trang chủ</a>
    <a data-tour="journal" href="/nhat-ky">Nhật ký</a>
    <a data-tour="dashboard" href="/tien-trinh">Dashboard</a>
    <a data-tour="library" href="/thu-vien">Thư viện</a>
    <a data-tour="help" href="/tro-chuyen">Hỏi về web app</a>
  `;
}

/** Năm bước nên bấm "Tiếp" bốn lần là tới bước cuối. */
async function goToLastStep(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 4; i++) {
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("OnboardingTour — hideTooltips", () => {
  it("hideTooltips=true -> không render gì cả", () => {
    renderAnchors();
    render(<OnboardingTour uid="u1" hideTooltips={true} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hideTooltips=false -> render bước đầu tiên", () => {
    renderAnchors();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("OnboardingTour — điều hướng bước", () => {
  it("đúng năm bước, có chỉ báo đang ở bước nào", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    expect(screen.getByText("Bước 1/5")).toBeInTheDocument();
    await goToLastStep(user);
    expect(screen.getByText("Bước 5/5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xong" })).toBeInTheDocument();
  });

  it("ghi tiến độ sau mỗi bước để 'Để sau' mở lại đúng chỗ", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "active", 1);
  });

  it("bấm Xong ở bước cuối -> ghi completed", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Xong" }));

    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "completed", 5);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mở lại đúng bước đang dở khi initialStep được truyền vào", () => {
    renderAnchors();
    render(<OnboardingTour uid="u1" hideTooltips={false} initialStep={2} />);
    expect(screen.getByText("Bước 3/5")).toBeInTheDocument();
  });

  // Số bước có thể GIẢM ở bản sau; một guideStep cũ vượt quá mảng sẽ làm
  // STEPS[stepIndex] thành undefined rồi vỡ ở reposition().
  it("initialStep vượt quá số bước bị kẹp về bước cuối, không vỡ", () => {
    renderAnchors();
    render(<OnboardingTour uid="u1" hideTooltips={false} initialStep={99} />);
    expect(screen.getByText("Bước 5/5")).toBeInTheDocument();
  });
});

describe("OnboardingTour — 'Để sau' và 'Bỏ qua' là hai việc khác nhau", () => {
  // Đây là toàn bộ lý do guideline §6.1 đòi cả hai nút: gộp làm một thì hoặc
  // quấy rầy người đã từ chối, hoặc bỏ rơi người định quay lại.
  it("'Để sau' ghi paused KÈM bước đang dở", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    await user.click(screen.getByRole("button", { name: "Để sau" }));

    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "paused", 1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("'Bỏ qua' ghi dismissed để KHÔNG tự chạy lại", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.click(screen.getByRole("button", { name: "Bỏ qua" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "dismissed", 0);
  });
});

describe("OnboardingTour — Escape", () => {
  it("Escape hoạt động giống 'Bỏ qua': đóng tour và ghi dismissed", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "dismissed", 0);
  });
});

describe("OnboardingTour — backdrop", () => {
  it("bấm vào lớp nền phía sau card -> đóng tour giống 'Bỏ qua'", async () => {
    renderAnchors();
    const user = userEvent.setup();
    const { container } = render(<OnboardingTour uid="u1" hideTooltips={false} />);

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetGuideProgress).toHaveBeenCalledWith("u1", "dismissed", 0);
  });
});
