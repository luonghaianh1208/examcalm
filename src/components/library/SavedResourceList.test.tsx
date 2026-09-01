import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SavedResourceList } from "./SavedResourceList";
import { listFavoriteIds } from "@/lib/firestore/favorites";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

vi.mock("@/lib/firestore/favorites", () => ({
  listFavoriteIds: vi.fn(),
  isFavorited: vi.fn(),
  toggleFavorite: vi.fn(),
  markUsed: vi.fn(),
}));

const mockResource: ResourceListItem = {
  id: "r1",
  title: "Bài test",
  slug: "bai-test",
  type: "article",
  category: "test",
  tags: [],
  content: "nội dung",
  tryThis: "",
  videoUrl: null,
  status: "published",
  visibility: "public",
  createdBy: "admin-1",
};

beforeEach(() => vi.clearAllMocks());

describe("SavedResourceList", () => {
  it("khi tải danh sách yêu thích thất bại: hiện trạng thái lỗi riêng, KHÔNG dùng chữ của trạng thái rỗng", async () => {
    vi.mocked(listFavoriteIds).mockRejectedValue(new Error("network lỗi"));
    render(<SavedResourceList uid="u1" allResources={[mockResource]} />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được danh sách đã lưu/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/bạn chưa lưu bài nào/i)).not.toBeInTheDocument();
  });

  it("khi tải thành công nhưng chưa lưu bài nào: hiện đúng trạng thái rỗng, không phải lỗi", async () => {
    vi.mocked(listFavoriteIds).mockResolvedValue([]);
    render(<SavedResourceList uid="u1" allResources={[mockResource]} />);

    await waitFor(() => {
      expect(screen.getByText(/bạn chưa lưu bài nào/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa tải được danh sách đã lưu/i)).not.toBeInTheDocument();
  });

  it("khi tải thành công và có bài đã lưu: hiện đúng danh sách bài đó", async () => {
    vi.mocked(listFavoriteIds).mockResolvedValue(["r1"]);
    render(<SavedResourceList uid="u1" allResources={[mockResource]} />);

    await waitFor(() => {
      expect(screen.getByText("Bài test")).toBeInTheDocument();
    });
  });
});
