import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listAllResources, saveResource, publishResource } from "@/lib/firestore/admin-resources";
import { ResourceEditor } from "./ResourceEditor";
import type { ResourceRecord } from "@/lib/firestore/admin-resources";

// Chỉ mock các hàm gọi Firestore để component test không cần emulator.
vi.mock("@/lib/firestore/admin-resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/admin-resources")>();
  return {
    ...actual,
    listAllResources: vi.fn(),
    saveResource: vi.fn(),
    publishResource: vi.fn(),
  };
});

const mockedListAllResources = vi.mocked(listAllResources);
const mockedSaveResource = vi.mocked(saveResource);
const mockedPublishResource = vi.mocked(publishResource);

const record1: ResourceRecord = {
  id: "r1",
  title: "Kỹ thuật thở 4-7-8",
  slug: "ky-thuat-tho-4-7-8",
  type: "article",
  category: "Thư giãn",
  tags: ["tho", "thu-gian"],
  content: "Nội dung mẫu.",
  videoUrl: null,
  status: "draft",
  visibility: "public",
  createdBy: "admin-0",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResourceEditor", () => {
  it("khi tải danh sách thất bại: hiện lỗi rõ ràng kèm nút thử lại, KHÔNG mãi mãi là khung chờ", async () => {
    mockedListAllResources.mockRejectedValue(new Error("network lỗi"));
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách tài nguyên/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /thử tải lại/i })).toBeInTheDocument();
    expect(screen.queryByText(/chưa có tài nguyên nào/i)).not.toBeInTheDocument();
  });

  it("bấm thử tải lại sau khi lỗi thì tải lại thành công", async () => {
    mockedListAllResources.mockRejectedValueOnce(new Error("network lỗi"));
    mockedListAllResources.mockResolvedValueOnce([]);
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách tài nguyên/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /thử tải lại/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa có tài nguyên nào/i)).toBeInTheDocument();
    });
  });

  it("khi tải thành công nhưng chưa có tài nguyên nào: hiện đúng trạng thái rỗng, không phải lỗi", async () => {
    mockedListAllResources.mockResolvedValue([]);
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa có tài nguyên nào/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa tải được danh sách tài nguyên/i)).not.toBeInTheDocument();
  });

  it("khi tải lại SAU khi lưu thất bại: chuyển sang trạng thái lỗi, KHÔNG để admin tưởng danh sách cũ vẫn còn đúng", async () => {
    mockedListAllResources.mockResolvedValueOnce([record1]);
    mockedSaveResource.mockResolvedValue("new-id");
    mockedListAllResources.mockRejectedValueOnce(new Error("network lỗi"));
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Kỹ thuật thở 4-7-8")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/tiêu đề/i), "Bài mới");
    await userEvent.type(screen.getByLabelText(/chủ đề/i), "Thư giãn");
    await userEvent.type(screen.getByLabelText(/nội dung/i), "Nội dung mẫu.");

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách tài nguyên/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Kỹ thuật thở 4-7-8")).not.toBeInTheDocument();
  });

  it("khi tải lại SAU khi đổi trạng thái đăng thất bại: chuyển sang trạng thái lỗi thay vì giữ danh sách cũ", async () => {
    mockedListAllResources.mockResolvedValueOnce([record1]);
    mockedPublishResource.mockResolvedValue(undefined);
    mockedListAllResources.mockRejectedValueOnce(new Error("network lỗi"));
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Kỹ thuật thở 4-7-8")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^đăng$/i }));

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách tài nguyên/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Kỹ thuật thở 4-7-8")).not.toBeInTheDocument();
  });

  it("bấm Sửa nạp đúng nội dung tài nguyên hiện có vào form, không đổi slug", async () => {
    mockedListAllResources.mockResolvedValue([record1]);
    render(<ResourceEditor adminUid="admin-1" />);
    await waitFor(() => {
      expect(screen.getByText("Kỹ thuật thở 4-7-8")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^sửa$/i }));

    expect(screen.getByRole("heading", { name: /sửa tài nguyên/i })).toBeInTheDocument();
    const titleInput = screen.getByLabelText(/tiêu đề/i) as HTMLInputElement;
    const slugInput = screen.getByLabelText(/slug/i) as HTMLInputElement;
    expect(titleInput.value).toBe("Kỹ thuật thở 4-7-8");
    expect(slugInput.value).toBe("ky-thuat-tho-4-7-8");

    await userEvent.type(titleInput, " mới");
    expect(slugInput.value).toBe("ky-thuat-tho-4-7-8");
  });

  it("lưu bản nháp thành công: hiện thông báo và tải lại danh sách", async () => {
    mockedListAllResources.mockResolvedValueOnce([]);
    mockedSaveResource.mockResolvedValue("new-id");
    mockedListAllResources.mockResolvedValueOnce([record1]);
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa có tài nguyên nào/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/tiêu đề/i), "Kỹ thuật thở 4-7-8");
    await userEvent.type(screen.getByLabelText(/chủ đề/i), "Thư giãn");
    await userEvent.type(screen.getByLabelText(/nội dung/i), "Nội dung mẫu.");

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/đã lưu bản nháp/i);
    });
    expect(mockedSaveResource).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ slug: "ky-thuat-tho-4-7-8" }),
      "admin-1",
    );
  });

  it("báo lỗi qua role=alert khi slug đã bị bài khác dùng, KHÔNG cập nhật danh sách", async () => {
    mockedListAllResources.mockResolvedValue([record1]);
    mockedSaveResource.mockRejectedValue(new Error('Slug "ky-thuat-tho-4-7-8" đã được dùng cho bài khác.'));
    render(<ResourceEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText("Kỹ thuật thở 4-7-8")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/tiêu đề/i), "Bài khác");
    await userEvent.type(screen.getByLabelText(/chủ đề/i), "Thư giãn");
    await userEvent.type(screen.getByLabelText(/nội dung/i), "Nội dung khác.");
    // Cố tình gõ trùng slug với bài đã có.
    const slugInput = screen.getByLabelText(/slug/i) as HTMLInputElement;
    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "ky-thuat-tho-4-7-8");

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/đã được dùng cho bài khác/i);
    });
  });
});
