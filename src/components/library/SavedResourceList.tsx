"use client";

import { useCallback, useEffect, useState } from "react";
import { listFavoriteIds } from "@/lib/firestore/favorites";
import { ResourceCard } from "./ResourceCard";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

export function SavedResourceList({
  uid, allResources,
}: { uid: string; allResources: ResourceListItem[] }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    listFavoriteIds(uid)
      .then((result) => {
        setIds(result);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  // Trạng thái lỗi PHẢI tách riêng khỏi trạng thái rỗng (giống MoodHistory):
  // gộp lỗi tải vào "chưa lưu bài nào" sẽ khiến một học sinh đã lưu nhiều bài,
  // gặp trục trặc mạng, đọc được dòng như thể các bài đã lưu của mình biến
  // mất, dù chúng vẫn còn nguyên trên server.
  if (loadFailed) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
        <p>
          Chưa tải được danh sách đã lưu lúc này — có thể do mạng chập chờn thôi.
          Những bài bạn đã lưu vẫn còn nguyên, không mất đâu.
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
        >
          Thử tải lại
        </button>
      </div>
    );
  }

  if (ids === null) {
    return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />;
  }

  const saved = allResources.filter((r) => ids.includes(r.id));
  if (saved.length === 0) {
    return <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Bạn chưa lưu bài nào.</p>;
  }

  return <ul className="flex flex-col gap-3">{saved.map((r) => <ResourceCard key={r.id} resource={r} />)}</ul>;
}
