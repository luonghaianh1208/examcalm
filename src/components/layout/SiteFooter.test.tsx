import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("hiển thị số 111 và ghi rõ miễn phí, 24/7 (I7 — an toàn trẻ em)", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "111" })).toHaveAttribute("href", "tel:111");
    expect(screen.getByText(/miễn phí/i)).toBeInTheDocument();
    expect(screen.getByText(/24\/7/)).toBeInTheDocument();
  });
});
