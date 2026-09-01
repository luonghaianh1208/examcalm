"use client";

import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { MUSIC_MOODS, type MusicTrack } from "@/lib/types/music";

export const musicDraftSchema = z.object({
  title: z.string().min(1, "Hãy nhập tên bài.").max(200),
  artist: z.string().max(200),
  /*
   * Không chỉ kiểm "là URL": kiểm luôn có nhúng được không.
   *
   * getYouTubeEmbedUrl là ĐÚNG hàm mà trình phát dùng, nên nếu nó trả null ở
   * đây thì trang Music Hub cũng sẽ không phát được. Bắt lỗi lúc thầy cô dán
   * link vẫn hơn để học sinh bấm Phát rồi thấy một khung trống.
   */
  youtubeUrl: z
    .string()
    .min(1, "Hãy dán link YouTube.")
    .refine((v) => getYouTubeEmbedUrl(v) !== null, "Link không phải video YouTube hợp lệ."),
  mood: z.enum(MUSIC_MOODS),
  rightsNote: z
    .string()
    .min(1, "Hãy ghi vì sao được phép dùng bài này.")
    .max(300),
  order: z.number().int().min(0),
});

export type MusicDraft = z.infer<typeof musicDraftSchema>;
export type MusicRecord = MusicTrack & { id: string };

/**
 * Liệt kê tường minh từng field thay vì spread — cùng lý do với
 * toResourceRecord() trong admin-resources.ts: document đọc về có thể mang
 * theo Timestamp (class instance) không nằm trong type.
 */
function toRecord(id: string, data: MusicTrack): MusicRecord {
  return {
    id,
    title: data.title,
    artist: data.artist ?? "",
    youtubeUrl: data.youtubeUrl,
    mood: data.mood,
    rightsNote: data.rightsNote,
    status: data.status,
    order: data.order ?? 0,
    updatedBy: data.updatedBy,
  };
}

export async function listAllMusicTracks(): Promise<MusicRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(collection(getDb(), "musicTracks"));
  return snap.docs
    .map((d) => toRecord(d.id, d.data() as MusicTrack))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "vi"));
}

export async function saveMusicTrack(
  draft: MusicDraft,
  uid: string,
  trackId: string | null,
): Promise<string> {
  await ensureAuthReady();
  const payload = {
    ...draft,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };

  if (trackId) {
    await updateDoc(doc(getDb(), "musicTracks", trackId), payload);
    return trackId;
  }
  // Bài mới luôn ở draft: thầy cô xem lại rồi mới publish, giống test và CBT.
  const ref = await addDoc(collection(getDb(), "musicTracks"), {
    ...payload,
    status: "draft",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function publishMusicTrack(trackId: string, publish: boolean): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "musicTracks", trackId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
