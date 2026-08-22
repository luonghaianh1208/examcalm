import { describe, it, expect } from "vitest";
import { getYouTubeEmbedUrl } from "./video";

describe("getYouTubeEmbedUrl", () => {
  it("chuyển link watch thành link nhúng nocookie", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("chấp nhận link rút gọn youtu.be", () => {
    expect(getYouTubeEmbedUrl("https://youtu.be/abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("chấp nhận sẵn link /embed/", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/embed/abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("từ chối domain ngoài allowlist", () => {
    expect(getYouTubeEmbedUrl("https://vimeo.com/12345")).toBeNull();
    expect(getYouTubeEmbedUrl("https://evil.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối domain giả mạo chứa chuỗi youtube", () => {
    expect(getYouTubeEmbedUrl("https://youtube.com.evil.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối domain giả mạo có đuôi trùng youtube.com", () => {
    expect(getYouTubeEmbedUrl("https://evilyoutube.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối chiêu userinfo giả làm host youtube.com", () => {
    expect(getYouTubeEmbedUrl("https://youtube.com@evil.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối javascript: và dữ liệu rác", () => {
    expect(getYouTubeEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(getYouTubeEmbedUrl("khong-phai-url")).toBeNull();
    expect(getYouTubeEmbedUrl("")).toBeNull();
  });

  it("từ chối video id sai định dạng", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=qua-ngan")).toBeNull();
  });
});
