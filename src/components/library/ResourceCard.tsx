import Link from "next/link";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

const TYPE_LABEL: Record<ResourceListItem["type"], string> = {
  article: "Bài viết",
  tip: "Mẹo nhỏ",
  video: "Video",
  guide: "Hướng dẫn",
};

export function ResourceCard({ resource }: { resource: ResourceListItem }) {
  return (
    <li>
      <Link href={`/thu-vien/${resource.slug}`} className="block rounded-xl border bg-white px-4 py-4 hover:bg-slate-50">
        <span className="text-sm text-slate-500">{TYPE_LABEL[resource.type]}</span>
        <span className="mt-1 block font-medium">{resource.title}</span>
        {resource.tags.length > 0 && (
          <span className="mt-1 block text-sm text-slate-500">{resource.tags.join(" · ")}</span>
        )}
      </Link>
    </li>
  );
}
