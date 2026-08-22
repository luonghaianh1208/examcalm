import { describe, it, expect } from "vitest";
import { signUpInputSchema } from "@/lib/auth-client";

describe("signUpInputSchema", () => {
  const valid = {
    email: "hocsinh@example.com",
    password: "matkhau123",
    nickname: "Mèo con",
    gradeLevel: "12",
    school: "THPT Trần Phú",
    examGoals: ["Khối A"],
  };

  it("chấp nhận dữ liệu hợp lệ", () => {
    expect(signUpInputSchema.safeParse(valid).success).toBe(true);
  });

  it("từ chối email sai định dạng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, email: "khong-phai-email" }).success).toBe(false);
  });

  it("từ chối mật khẩu dưới 8 ký tự", () => {
    expect(signUpInputSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
  });

  it("từ chối khối lớp ngoài 10/11/12", () => {
    expect(signUpInputSchema.safeParse({ ...valid, gradeLevel: "9" }).success).toBe(false);
  });

  it("từ chối biệt danh rỗng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, nickname: "" }).success).toBe(false);
  });

  it("cho phép examGoals rỗng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, examGoals: [] }).success).toBe(true);
  });
});
