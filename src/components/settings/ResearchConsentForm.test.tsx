import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchConsentForm, RESEARCH_CONSENT_VERSION } from "./ResearchConsentForm";
import { updateDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

const mockedUpdateDoc = vi.mocked(updateDoc);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResearchConsentForm", () => {
  it("khi bấm đồng ý: ghi researchConsent.granted=true kèm version", async () => {
    const user = userEvent.setup();
    render(<ResearchConsentForm uid="u1" initialGranted={false} />);

    await user.click(screen.getByRole("checkbox"));

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        researchConsent: {
          granted: true,
          grantedAt: "SERVER_TIMESTAMP",
          version: RESEARCH_CONSENT_VERSION,
        },
      }),
    );
  });

  it("khi bỏ đồng ý: ghi researchConsent.granted=false, grantedAt=null", async () => {
    const user = userEvent.setup();
    render(<ResearchConsentForm uid="u1" initialGranted={true} />);

    await user.click(screen.getByRole("checkbox"));

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        researchConsent: {
          granted: false,
          grantedAt: null,
          version: RESEARCH_CONSENT_VERSION,
        },
      }),
    );
  });

  // Finding 5 của review: assert toHaveBeenCalled() không bắt được lỗi đảo thứ
  // tự (ensureAuthReady sau updateDoc) — đúng chỗ regression carry-forward này
  // muốn ngăn. Phải assert thứ tự tương đối, không chỉ "có gọi hay không".
  it("gọi ensureAuthReady TRƯỚC khi ghi Firestore — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedUpdateDoc.mockImplementation(async () => {
      order.push("updateDoc");
    });

    const user = userEvent.setup();
    render(<ResearchConsentForm uid="u1" initialGranted={false} />);
    await user.click(screen.getByRole("checkbox"));

    expect(order).toEqual(["ensureAuthReady", "updateDoc"]);
  });

  it("nói rõ từ chối vẫn dùng đầy đủ mọi tính năng", () => {
    render(<ResearchConsentForm uid="u1" initialGranted={false} />);
    expect(screen.getByText(/từ chối thì vẫn dùng đầy đủ mọi tính năng/i)).toBeInTheDocument();
  });

  it("nhắc học sinh dưới 18 tuổi trao đổi với phụ huynh hoặc thầy cô", () => {
    render(<ResearchConsentForm uid="u1" initialGranted={false} />);
    expect(screen.getByText(/dưới 18 tuổi.*phụ huynh.*thầy cô/i)).toBeInTheDocument();
  });
});
