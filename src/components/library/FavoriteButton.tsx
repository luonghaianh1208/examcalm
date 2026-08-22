"use client";

import { useCallback, useEffect, useState } from "react";
import { isFavorited, toggleFavorite } from "@/lib/firestore/favorites";

export function FavoriteButton({ uid, resourceId }: { uid: string; resourceId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    isFavorited(uid, resourceId)
      .then((result) => {
        setSaved(result);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, [uid, resourceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Không rõ đã lưu hay chưa (đọc thất bại) — TUYỆT ĐỐI không được đoán bừa
  // thành "chưa lưu": nếu học sinh bấm nút lúc đó, nút sẽ vô tình BỎ LƯU một
  // bài họ đã lưu thật. Hiện nút vô hiệu hoá + nút thử lại thay vì đoán.
  if (loadFailed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="rounded-lg border px-4 py-2 text-amber-900 opacity-60"
        >
          Không tải được trạng thái lưu
        </button>
        <button
          type="button"
          onClick={load}
          className="text-sm font-medium text-amber-900 underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (saved === null) {
    return <div aria-busy="true" className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />;
  }

  async function handleClick() {
    setPending(true);
    setActionError(null);
    try {
      setSaved(await toggleFavorite(uid, resourceId));
    } catch {
      setActionError("Không lưu được lúc này, thử lại nhé.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button" onClick={handleClick} disabled={pending}
        className="rounded-lg border px-4 py-2 disabled:opacity-60"
      >
        {saved ? "Bỏ lưu bài này" : "Lưu bài này"}
      </button>
      {actionError && (
        <p role="alert" className="mt-2 text-sm text-rose-700">{actionError}</p>
      )}
    </div>
  );
}
