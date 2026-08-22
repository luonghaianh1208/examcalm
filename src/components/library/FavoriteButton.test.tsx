import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
