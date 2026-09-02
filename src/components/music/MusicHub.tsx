"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MusicTrackCard } from "@/components/music/MusicTrackCard";
import { OwnTrackCard } from "@/components/music/OwnTrackCard";
import { AddOwnTrackForm } from "@/components/music/AddOwnTrackForm";
import { pickSavedTracks, type StudentTrackDraft } from "@/lib/music-personal";
import {
  addOwnTrack, deleteOwnTrack, listOwnTracks, listSavedTrackIds, suggestOwnTrack,
  toggleSavedTrack, type OwnTrackRecord,
} from "@/lib/firestore/music-personal";
import { MUSIC_MOODS, MUSIC_MOOD_LABELS } from "@/lib/types/music";
import type { MusicTrackListItem } from "@/lib/firebase/queries-public";

/**
 * Music Hub: kho chung của trường + kho riêng của học sinh, trong một component.
 *
 * Gộp làm một thay vì tách hai vì cả hai phần cùng đọc MỘT tập `savedIds`:
 * tách ra thì nút "Lưu" ở kho chung và danh sách "Đã lưu" bên dưới sẽ là hai
 * nguồn sự thật, và chúng lệch nhau ngay lần bấm đầu tiên.
 *
 * Dữ liệu riêng tư tải ở client (không phải server) — cùng khuôn với trang
 * /da-luu: rules chỉ cho chủ tài khoản đọc, nên phải đọc bằng phiên của chính
 * em ấy.
 */
export function MusicHub({
  tracks,
  uid,
}: {
  tracks: MusicTrackListItem[];
  /** null = khách chưa đăng nhập. Kho chung vẫn nghe được bình thường. */
  uid: string | null;
}) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [ownTracks, setOwnTracks] = useState<OwnTrackRecord[]>([]);
  const [dangTai, setDangTai] = useState(uid !== null);
  const [loiTai, setLoiTai] = useState(false);

  /*
   * ĐỌC thôi, không setState — mọi setState nằm trong callback của người gọi.
   *
   * Tách như vậy để effect bên dưới không gọi thẳng một hàm có setState bên
   * trong: đó chính là thứ react-hooks/set-state-in-effect chặn, và cũng là
   * thứ gây chuỗi render lồng nhau.
   */
  const docKhoRieng = useCallback(async () => {
    if (!uid) return null;
    const [ids, own] = await Promise.all([listSavedTrackIds(uid), listOwnTracks(uid)]);
    return { ids, own };
  }, [uid]);

  /** Đọc lại rồi cập nhật state — chỉ gọi từ trình xử lý sự kiện, không từ effect. */
  async function taiLaiKhoRieng(): Promise<void> {
    const kq = await docKhoRieng();
    if (!kq) return;
    setSavedIds(kq.ids);
    setOwnTracks(kq.own);
  }

  useEffect(() => {
    if (!uid) return;
    let huy = false;
    // dangTai đã khởi tạo true khi có uid — không setState đồng bộ ở đây.
    docKhoRieng()
      .then((kq) => {
        if (huy || !kq) return;
        setSavedIds(kq.ids);
        setOwnTracks(kq.own);
        setLoiTai(false);
      })
      .catch(() => { if (!huy) setLoiTai(true); })
      .finally(() => { if (!huy) setDangTai(false); });
    return () => { huy = true; };
  }, [uid, docKhoRieng]);

  async function doiLuu(trackId: string): Promise<void> {
    if (!uid) return;
    // Cập nhật lạc quan: học sinh bấm Lưu thấy đổi ngay, không chờ mạng.
    const daLuu = savedIds.includes(trackId);
    setSavedIds((prev) => (daLuu ? prev.filter((id) => id !== trackId) : [...prev, trackId]));
    try {
      await toggleSavedTrack(uid, trackId);
    } catch {
      // Ghi hỏng thì trả về đúng trạng thái thật, không để nút nói dối.
      setSavedIds((prev) => (daLuu ? [...prev, trackId] : prev.filter((id) => id !== trackId)));
      setLoiTai(true);
    }
  }

  async function themBai(draft: StudentTrackDraft): Promise<void> {
    if (!uid) return;
    await addOwnTrack(uid, draft);
    await taiLaiKhoRieng();
  }

  async function deXuat(track: OwnTrackRecord): Promise<void> {
    if (!uid) return;
    await suggestOwnTrack(uid, track);
    await taiLaiKhoRieng();
  }

  async function xoaBai(trackId: string): Promise<void> {
    if (!uid) return;
    await deleteOwnTrack(uid, trackId);
    await taiLaiKhoRieng();
  }

  const daLuuSet = new Set(savedIds);
  const baiDaLuu = pickSavedTracks(savedIds, tracks);

  return (
    <>
      {tracks.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          Chưa có bài nào. Bạn quay lại sau nhé.
        </p>
      ) : (
        MUSIC_MOODS.map((mood) => {
          const cua = tracks.filter((t) => t.mood === mood);
          // Nhóm rỗng thì không hiện tiêu đề trống — thầy cô có thể mới chỉ
          // thêm nhạc cho một nhóm.
          if (cua.length === 0) return null;
          return (
            <section key={mood}>
              <h2 className="mb-3 text-lg font-medium text-ink">{MUSIC_MOOD_LABELS[mood]}</h2>
              <ul className="flex flex-col gap-3">
                {cua.map((t) => (
                  <MusicTrackCard
                    key={t.id}
                    track={t}
                    saved={uid ? daLuuSet.has(t.id) : null}
                    onToggleSave={() => void doiLuu(t.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <section className="mt-6 border-t border-line pt-8">
        <h2 className="mb-2 text-lg font-medium text-ink">Kho của tôi</h2>

        {!uid ? (
          <p className="rounded-[var(--ec-radius-lg)] bg-brand-soft px-5 py-4 text-body">
            Bạn nghe kho của trường mà không cần tài khoản.{" "}
            <Link href="/dang-ky" className="text-link underline">Tạo tài khoản</Link> nếu muốn lưu
            bài và thêm nhạc của riêng mình.
          </p>
        ) : dangTai ? (
          <p className="text-muted">Đang tải kho của bạn…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {loiTai && (
              <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
                Chưa tải hoặc lưu được kho của bạn. Kiểm tra kết nối mạng rồi tải lại trang.
              </p>
            )}

            <div>
              <h3 className="mb-3 font-medium text-ink">Đã lưu từ kho trường</h3>
              {baiDaLuu.length === 0 ? (
                <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-4 text-body">
                  Chưa lưu bài nào. Bấm <strong>Lưu</strong> ở bài nào bạn thích phía trên.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {baiDaLuu.map((t) => (
                    <MusicTrackCard
                      key={t.id}
                      track={t}
                      saved
                      onToggleSave={() => void doiLuu(t.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-3 font-medium text-ink">Bài bạn tự thêm</h3>
              {ownTracks.length > 0 && (
                <ul className="mb-3 flex flex-col gap-3">
                  {ownTracks.map((t) => (
                    <OwnTrackCard
                      key={t.id}
                      track={t}
                      onSuggest={() => deXuat(t)}
                      onDelete={() => xoaBai(t.id)}
                    />
                  ))}
                </ul>
              )}
              <AddOwnTrackForm onAdd={themBai} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
