import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FavoriteButton } from "./FavoriteButton";
import { isFavorited, toggleFavorite } from "@/lib/firestore/favorites";

vi.mock("@/lib/firestore/favorites", () => ({
  isFavorited: vi.fn(),
  toggleFavorite: vi.fn(),
  listFavoriteIds: vi.fn(),
  markUsed: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("FavoriteButton", () => {
  it("hiện trạng thái chưa lưu khi tải xong", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    render(<FavoriteButton uid="u1" resourceId="r1" />);
    expect(await screen.findByRole("button", { name: /lưu bài này/i })).toBeInTheDocument();
  });

  it("hiện trạng thái đã lưu", async () => {
    vi.mocked(isFavorited).mockResolvedValue(true);
    render(<FavoriteButton uid="u1" resourceId="r1" />);
    expect(await screen.findByRole("button", { name: /bỏ lưu/i })).toBeInTheDocument();
  });

  it("đổi trạng thái khi bấm", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    vi.mocked(toggleFavorite).mockResolvedValue(true);
    const user = userEvent.setup();

    render(<FavoriteButton uid="u1" resourceId="r1" />);
    await user.click(await screen.findByRole("button", { name: /lưu bài này/i }));

    expect(toggleFavorite).toHaveBeenCalledWith("u1", "r1");
    expect(await screen.findByRole("button", { name: /bỏ lưu/i })).toBeInTheDocument();
  });

  // Finding 1: mock trả về false trong khi state cũ cũng là false — một cài
  // đặt sai kiểu setSaved(prev => !prev) sẽ lật thành "Bỏ lưu bài này", cài
  // đặt đúng (dùng giá trị toggleFavorite trả về) sẽ giữ nguyên "Lưu bài này".
  it("dùng đúng giá trị toggleFavorite trả về, không tự phủ định state cũ", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    vi.mocked(toggleFavorite).mockResolvedValue(false);
    const user = userEvent.setup();

    render(<FavoriteButton uid="u1" resourceId="r1" />);
    await user.click(await screen.findByRole("button", { name: /^lưu bài này$/i }));

    expect(toggleFavorite).toHaveBeenCalledWith("u1", "r1");
    expect(await screen.findByRole("button", { name: /^lưu bài này$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bỏ lưu/i })).not.toBeInTheDocument();
  });

  it("khi tải trạng thái ban đầu thất bại: không khẳng định đã lưu hay chưa lưu", async () => {
    vi.mocked(isFavorited).mockRejectedValue(new Error("network lỗi"));
    render(<FavoriteButton uid="u1" resourceId="r1" />);

    await waitFor(() => {
      expect(screen.getByText(/không tải được/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^lưu bài này$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^bỏ lưu bài này$/i })).not.toBeInTheDocument();
  });

  it("khi bấm lưu thất bại: hiện thông báo lỗi và nút vẫn dùng được", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    vi.mocked(toggleFavorite).mockRejectedValue(new Error("network lỗi"));
    const user = userEvent.setup();

    render(<FavoriteButton uid="u1" resourceId="r1" />);
    await user.click(await screen.findByRole("button", { name: /^lưu bài này$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^lưu bài này$/i })).toBeEnabled();
  });
});
