const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

/** YouTube video id: đúng 11 ký tự trong [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Trả về URL nhúng nocookie nếu URL thuộc allowlist và có video id hợp lệ.
 * Trả null cho mọi trường hợp còn lại — gọi bên ngoài phải xử lý null.
 */
export function getYouTubeEmbedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  let id: string | null = null;
  if (url.hostname.toLowerCase() === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/embed/")) {
    id = url.pathname.slice("/embed/".length);
  }

  if (!id || !VIDEO_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
