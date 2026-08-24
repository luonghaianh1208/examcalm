import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingTour } from "./OnboardingTour";
import { setHideTooltips } from "@/lib/firestore/onboarding";

vi.mock("@/lib/firestore/onboarding", () => ({
  setHideTooltips: vi.fn().mockResolvedValue(undefined),
}));

const mockedSetHideTooltips = vi.mocked(setHideTooltips);

/** Bốn anchor thật mà tour sẽ đo vị trí — không có thì reposition() chỉ bỏ qua styling. */
function renderAnchors() {
  document.body.innerHTML = `
    <button data-tour="mood">Mèo</button>
    <a data-tour="test" href="/test">Bài test</a>
    <a data-tour="library" href="/thu-vien">Thư viện</a>
    <a data-tour="progress" href="/tien-trinh">Tiến trình</a>
  `;
}

async function goToLastStep(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 3; i++) {
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
  it("chỉ hiện checkbox 'không hiện lại' ở bước cuối cùng", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await goToLastStep(user);
    expect(screen.getByRole("checkbox", { name: /không hiện lại hướng dẫn này/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xong" })).toBeInTheDocument();
  });

  it("tick checkbox ở bước cuối -> gọi setHideTooltips(uid, true)", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await goToLastStep(user);
    await user.click(screen.getByRole("checkbox", { name: /không hiện lại hướng dẫn này/i }));

    expect(mockedSetHideTooltips).toHaveBeenCalledWith("u1", true);
  });
});

describe("OnboardingTour — 'Bỏ qua'", () => {
  it("kết thúc tour ngay lập tức, KHÔNG gọi setHideTooltips (nên lần sau vẫn hiện lại)", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.click(screen.getByRole("button", { name: "Bỏ qua" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetHideTooltips).not.toHaveBeenCalled();
  });
});

describe("OnboardingTour — Escape", () => {
  it("Escape hoạt động giống 'Bỏ qua': đóng tour, không gọi setHideTooltips", async () => {
    renderAnchors();
    const user = userEvent.setup();
    render(<OnboardingTour uid="u1" hideTooltips={false} />);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetHideTooltips).not.toHaveBeenCalled();
  });
});

describe("OnboardingTour — backdrop", () => {
  it("bấm vào lớp nền phía sau card -> đóng tour giống 'Bỏ qua', không gọi setHideTooltips", async () => {
    renderAnchors();
    const user = userEvent.setup();
    const { container } = render(<OnboardingTour uid="u1" hideTooltips={false} />);

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedSetHideTooltips).not.toHaveBeenCalled();
  });
});
