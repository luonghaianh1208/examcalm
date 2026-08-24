import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "./SiteHeader";
import type { SessionUser } from "@/lib/firebase/session";

const STUDENT: SessionUser = { uid: "u1", email: "hs@example.com", emailVerified: true, role: "student" };
const ADMIN: SessionUser = { uid: "u2", email: "admin@example.com", emailVerified: true, role: "admin" };

describe("SiteHeader", () => {
  it("khách chưa đăng nhập thấy Đăng nhập/Đăng ký, không thấy Tiến trình hay Quản trị", () => {
    render(<SiteHeader user={null} />);

    expect(screen.getByRole("link", { name: /đăng nhập/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /đăng ký/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bài tập/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tiến trình/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /quản trị/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /hồ sơ/i })).not.toBeInTheDocument();
  });

  it("học sinh đã đăng nhập thấy Tiến trình và Hồ sơ, không thấy Quản trị", () => {
    render(<SiteHeader user={STUDENT} />);

    expect(screen.getByRole("link", { name: /tiến trình/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hồ sơ/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /quản trị/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /đăng nhập/i })).not.toBeInTheDocument();
  });

  it("admin thấy đủ Tiến trình, Quản trị và Hồ sơ", () => {
    render(<SiteHeader user={ADMIN} />);

    expect(screen.getByRole("link", { name: /tiến trình/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quản trị/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hồ sơ/i })).toBeInTheDocument();
  });
});
