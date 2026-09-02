"use client";

import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { MUSIC_MOODS, type MusicSuggestion, type MusicTrack } from "@/lib/types/music";

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

export type MusicSuggestionRecord = MusicSuggestion & { id: string };

/**
 * Đề xuất nhạc từ học sinh, bài chờ lâu nhất lên trước.
 *
 * Sắp trong bộ nhớ chứ không orderBy ở Firestore — cùng lý do với
 * listAllMusicTracks ở trên: giữ đúng một query shape, không sinh thêm
 * composite index mà Emulator không kiểm tra được.
 */
export async function listMusicSuggestions(): Promise<MusicSuggestionRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(collection(getDb(), "musicSuggestions"), where("status", "==", "pending")),
  );
  // Thời điểm gửi giữ ở Map riêng thay vì nhét thêm field vào record: record
  // trả ra khớp đúng MusicSuggestion, không mang theo field chỉ dùng để sắp.
  const luc = new Map<string, number>();
  const records: MusicSuggestionRecord[] = snap.docs.map((d) => {
    const data = d.data() as MusicSuggestion & { createdAt?: { toMillis?: () => number } };
    luc.set(d.id, data.createdAt?.toMillis?.() ?? 0);
    return {
      id: d.id,
      authorUid: data.authorUid,
      title: data.title,
      artist: data.artist ?? "",
      youtubeUrl: data.youtubeUrl,
      mood: data.mood,
      status: data.status,
      reviewedBy: data.reviewedBy ?? "",
    };
  });

  // Bài chờ lâu nhất lên trước — một đề xuất nằm quên nghĩa là một học sinh đã
  // góp gì đó rồi không nhận được hồi âm nào.
  return records.sort((a, b) => (luc.get(a.id) ?? 0) - (luc.get(b.id) ?? 0));
}

/**
 * Đánh dấu một đề xuất đã xử lý.
 *
 * CỐ Ý không tự tạo bài trong `musicTracks`: `rightsNote` là bắt buộc và chỉ
 * thầy cô mới có căn cứ điền. Nhận đề xuất = mở form thêm bài với thông tin
 * điền sẵn, thầy cô ghi nguồn rồi mới lưu. Hàm này chỉ dọn hàng chờ.
 */
export async function reviewMusicSuggestion(
  suggestionId: string,
  status: "approved" | "rejected",
  adminUid: string,
): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "musicSuggestions", suggestionId), {
    status,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  });
}

export async function publishMusicTrack(trackId: string, publish: boolean): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "musicTracks", trackId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
