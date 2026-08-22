import { getYouTubeEmbedUrl } from "@/lib/video";

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const embedUrl = getYouTubeEmbedUrl(url);

  if (!embedUrl) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border px-4 py-3 underline">
        Mở video ở tab mới
      </a>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl">
      <iframe
        src={embedUrl} title={title} loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen className="h-full w-full"
      />
    </div>
  );
}
