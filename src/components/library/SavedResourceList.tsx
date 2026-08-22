"use client";

import { useEffect, useState } from "react";
import { listFavoriteIds } from "@/lib/firestore/favorites";
import { ResourceCard } from "./ResourceCard";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

export function SavedResourceList({
  uid, allResources,
}: { uid: string; allResources: ResourceListItem[] }) {
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    listFavoriteIds(uid).then(setIds).catch(() => setIds([]));
  }, [uid]);

  if (ids === null) {
    return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />;
  }

  const saved = allResources.filter((r) => ids.includes(r.id));
  if (saved.length === 0) {
    return <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Bạn chưa lưu bài nào.</p>;
  }

  return <ul className="flex flex-col gap-3">{saved.map((r) => <ResourceCard key={r.id} resource={r} />)}</ul>;
}
