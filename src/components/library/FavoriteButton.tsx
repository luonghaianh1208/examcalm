"use client";

import { useEffect, useState } from "react";
import { isFavorited, toggleFavorite } from "@/lib/firestore/favorites";

export function FavoriteButton({ uid, resourceId }: { uid: string; resourceId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    isFavorited(uid, resourceId).then(setSaved).catch(() => setSaved(false));
  }, [uid, resourceId]);

  if (saved === null) {
    return <div aria-busy="true" className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />;
  }

  async function handleClick() {
    setPending(true);
    try {
      setSaved(await toggleFavorite(uid, resourceId));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button" onClick={handleClick} disabled={pending}
      className="rounded-lg border px-4 py-2 disabled:opacity-60"
    >
      {saved ? "Bỏ lưu bài này" : "Lưu bài này"}
    </button>
  );
}
