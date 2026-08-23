/** Chuyển tiêu đề tiếng Việt thành slug URL: chữ thường không dấu, nối bằng dấu gạch. */
export function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")   // bỏ mọi dấu tổ hợp mà NFD vừa tách rời
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
