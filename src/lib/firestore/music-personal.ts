"use client";

import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import type { StudentTrackDraft } from "@/lib/music-personal";
import type { MusicSuggestion, MusicSuggestionStatus, StudentTrack } from "@/lib/types/music";

/*
 * Mọi hàm ở đây gọi ensureAuthReady() trước — cùng lý do với favorites.ts:
 * học sinh vừa đăng nhập xong mở ngay Music Hub thì request.auth chưa kịp khôi
 * phục, và Firestore từ chối đọc kho riêng.
 */

export type OwnTrackRecord = StudentTrack & {
  id: string;
  /** Trạng thái đề xuất, null khi bài này chưa từng được đề xuất. */
  suggestion: MusicSuggestionStatus | null;
};

function savedRef(uid: string, trackId: string) {
  return doc(getDb(), "users", uid, "musicSaved", trackId);
}

export async function listSavedTrackIds(uid: string): Promise<string[]> {
  await ensureAuthReady();
  const snap = await getDocs(collection(getDb(), "users", uid, "musicSaved"));
  return snap.docs.map((d) => d.id);
}

/** Bật/tắt lưu một bài của kho chung. Trả về trạng thái SAU khi đổi. */
export async function toggleSavedTrack(uid: string, trackId: string): Promise<boolean> {
  await ensureAuthReady();
  const ref = savedRef(uid, trackId);
  if ((await getDoc(ref)).exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { trackId, savedAt: serverTimestamp() });
  return true;
}

/**
 * Kho riêng: bài học sinh tự thêm, kèm trạng thái đề xuất nếu có.
 *
 * Đọc trạng thái bằng MỘT query trên musicSuggestions (lọc theo authorUid —
 * đúng điều kiện rules cho phép) rồi ghép trong bộ nhớ, thay vì đọc từng
 * document đề xuất một. Học sinh có mười bài tự thêm thì đây là 2 lượt đọc chứ
 * không phải 11.
 */
export async function listOwnTracks(uid: string): Promise<OwnTrackRecord[]> {
  await ensureAuthReady();
  const db = getDb();

  const [ownSnap, suggestionSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "musicOwn")),
    getDocs(query(collection(db, "musicSuggestions"), where("authorUid", "==", uid))),
  ]);

  const trangThai = new Map<string, MusicSuggestionStatus>();
  for (const d of suggestionSnap.docs) {
    trangThai.set(d.id, (d.data() as MusicSuggestion).status);
  }

  return ownSnap.docs
    .map((d) => {
      const data = d.data() as StudentTrack;
      const suggestionId = data.suggestionId ?? "";
      return {
        id: d.id,
        title: data.title,
        artist: data.artist ?? "",
        youtubeUrl: data.youtubeUrl,
        mood: data.mood,
        suggestionId,
        // Đề xuất đã bị xoá (học sinh rút lại, hoặc admin dọn) thì coi như chưa
        // từng đề xuất — nút "Đề xuất cho trường" hiện lại được.
        suggestion: trangThai.get(suggestionId) ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "vi"));
}

export async function addOwnTrack(uid: string, draft: StudentTrackDraft): Promise<string> {
  await ensureAuthReady();
  const ref = await addDoc(collection(getDb(), "users", uid, "musicOwn"), {
    ...draft,
    suggestionId: "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteOwnTrack(uid: string, trackId: string): Promise<void> {
  await ensureAuthReady();
  await deleteDoc(doc(getDb(), "users", uid, "musicOwn", trackId));
}

/**
 * Đề xuất một bài trong kho riêng cho kho chung của trường.
 *
 * Ghi bản sao sang `musicSuggestions` chứ không cho thầy cô đọc thẳng kho
 * riêng: đó là ranh giới của tính năng này — thầy cô chỉ thấy đúng bài học
 * sinh chọn gửi, không thấy phần còn lại.
 *
 * `status`/`reviewedBy` đặt cứng ở đây cho khớp điều kiện rules; rules mới là
 * nơi ép thật, chỗ này chỉ để lời gọi không bị từ chối.
 */
export async function suggestOwnTrack(uid: string, track: OwnTrackRecord): Promise<void> {
  await ensureAuthReady();
  const db = getDb();

  const ref = await addDoc(collection(db, "musicSuggestions"), {
    authorUid: uid,
    title: track.title,
    artist: track.artist,
    youtubeUrl: track.youtubeUrl,
    mood: track.mood,
    status: "pending",
    reviewedBy: "",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "users", uid, "musicOwn", track.id), { suggestionId: ref.id });
}
