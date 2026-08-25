"use client";

import { useEffect, useState } from "react";
import {
  startChatSession,
  sendMessage,
  listMessages,
  listMySessions,
  deleteMessage,
  deleteSession,
  type ChatMessageRecord,
} from "@/lib/firestore/chat";
import { getAiOptIn } from "@/lib/firestore/ai-optin";
import { getAiPublicConfig } from "@/lib/firestore/ai-public";

type Props = {
  /** uid của học sinh — dùng để tự đọc cổng của chính mình và gọi đúng dữ liệu của mình. */
  uid: string;
};

// Cùng khuôn Gate của ReflectionCard.tsx (Task 11b, quyết định 1): "checking" chưa biết cổng
// mở hay đóng, "closed" aiOptIn tắt hoặc aiPublic chưa khả dụng — im lặng tuyệt đối (không
// gọi bất kỳ hàm nào ở chat.ts), "open" đủ điều kiện dùng chat.
type Gate = "checking" | "closed" | "open";
// "loading": đang tải phiên gần nhất + tin nhắn của nó lần đầu. "ready": đã sẵn sàng gõ.
// "error": tải thất bại, cho phép thử lại.
type InitPhase = "loading" | "ready" | "error";

const SAFETY_SENTENCE =
  "Nếu em nói điều gì khiến chúng tôi lo cho sự an toàn của em, thầy cô sẽ được báo để giúp em.";
const INIT_ERROR_MESSAGE = "Không thể tải cuộc trò chuyện lúc này, thử lại sau nhé.";
const GENERIC_SEND_ERROR = "Không thể gửi tin nhắn lúc này, thử lại sau nhé.";

/**
 * Màn hình chat (Task 7, design spec §3.5, §3.3). Tự đọc cổng của chính mình
 * (privacySettings.aiOptIn + systemConfig/aiPublic) thay vì nhận prop — cùng lý do
 * ReflectionCard.tsx: trang chứa nó không cần biết gì về AI.
 *
 * Không tạo `chatSessions` mới cho tới khi học sinh THỰC SỰ gửi tin đầu tiên (lazy) — mở lại
 * trang không tự sinh document rác nếu học sinh chỉ đọc câu cảnh báo an toàn rồi rời đi. Nếu
 * đã có phiên trước đó (listMySessions, sắp xếp mới nhất trước), tải lại đúng phiên đó để
 * cuộc trò chuyện có trí nhớ qua nhiều lần mở trang — khớp lý do listMySessions tồn tại.
 */
export function ChatWindow({ uid }: Props) {
  const [gate, setGate] = useState<Gate>("checking");
  const [initPhase, setInitPhase] = useState<InitPhase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  // Tăng để buộc effect tải phiên chạy lại khi học sinh bấm "Thử tải lại" — gate không đổi
  // giá trị giữa hai lần nên tự nó không đủ để re-trigger effect.
  const [reloadKey, setReloadKey] = useState(0);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState(false);

  // Đọc cổng — cùng khuôn ReflectionCard.tsx: đọc aiOptIn TRƯỚC, chỉ đọc tiếp
  // systemConfig/aiPublic (document nóng dùng chung toàn trường) khi optIn đã bật.
  useEffect(() => {
    let cancelled = false;
    setGate("checking");
    (async () => {
      const optIn = await getAiOptIn(uid);
      if (!optIn) {
        if (!cancelled) setGate("closed");
        return;
      }
      const aiPublic = await getAiPublicConfig();
      if (cancelled) return;
      setGate(aiPublic.enabled ? "open" : "closed");
    })().catch(() => {
      // Fail-closed tường minh — cùng lý do ReflectionCard.tsx (Fix round 1, Finding 4).
      if (!cancelled) setGate("closed");
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Tải phiên gần nhất (nếu có) + tin nhắn của nó — chỉ chạy khi cổng đã mở.
  useEffect(() => {
    if (gate !== "open") return;
    let cancelled = false;
    setInitPhase("loading");

    void loadLatestSession();

    async function loadLatestSession() {
      try {
        const sessions = await listMySessions(uid);
        const latest = sessions[0] ?? null;
        if (latest === null) {
          if (!cancelled) {
            setSessionId(null);
            setMessages([]);
            setInitPhase("ready");
          }
          return;
        }
        const history = await listMessages(uid, latest.id);
        if (cancelled) return;
        setSessionId(latest.id);
        setMessages(history);
        setInitPhase("ready");
      } catch {
        if (!cancelled) setInitPhase("error");
      }
    }

    return () => {
      cancelled = true;
    };
  }, [gate, uid, reloadKey]);

  // Im lặng tuyệt đối khi cổng chưa mở — không upsell, không ô nhập bị vô hiệu hoá mời chào.
  if (gate === "checking") return null;

  if (gate === "closed") {
    return (
      <section aria-label="Trò chuyện cùng mèo" className="rounded-xl border bg-white px-4 py-4">
        <p className="text-slate-600">
          Bạn cần bật tính năng AI trong phần Cài đặt riêng tư để trò chuyện cùng mèo.{" "}
          <a href="/ho-so" className="font-medium text-teal-700 underline">
            Tới trang Hồ sơ
          </a>
        </p>
      </section>
    );
  }

  async function handleSend() {
    const text = draft.trim();
    if (text === "" || sending) return;

    setSending(true);
    setSendError(null);
    setPendingText(text);
    setDraft("");

    let sid = sessionId;
    try {
      if (sid === null) {
        sid = await startChatSession(uid);
        setSessionId(sid);
      }
      await sendMessage(sid, text);
    } catch (err) {
      // Gửi thất bại: KHÔNG có tin nào thật sự được lưu (Cloud Function ghi tin học sinh
      // TRƯỚC khi gọi model — nhưng nếu nó lưu rồi mới lỗi, chat.ts đã dịch riêng thông điệp
      // "đã được lưu" cho trường hợp đó, ChatWindow không cần tự đoán). Trả chữ về ô nhập để
      // học sinh không phải gõ lại — mất một tin nhắn đã lấy hết can đảm để viết còn tệ hơn
      // chính lỗi gửi.
      setSendError(err instanceof Error ? err.message : GENERIC_SEND_ERROR);
      setDraft(text);
      setPendingText(null);
      setSending(false);
      return;
    }

    // sendMessage đã thành công — tin thật sự đã lưu. Từ đây KHÔNG được trả chữ về ô nhập nữa
    // dù bước tải lại danh sách bên dưới có lỗi, kẻo học sinh gửi trùng lặp.
    try {
      const refreshed = await listMessages(uid, sid);
      setMessages(refreshed);
    } catch {
      setSendError("Không thể tải tin trả lời lúc này, thử tải lại trang nhé.");
    }
    setPendingText(null);
    setSending(false);
  }

  async function handleConfirmDeleteMessage(id: string) {
    try {
      await deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setConfirmingDeleteId(null);
    } catch {
      // Giữ nguyên bước xác nhận để học sinh bấm lại thử — không nói đã xoá khi chưa xoá thật.
      setDeleteError("Không thể xoá tin này lúc này, thử lại sau nhé.");
    }
  }

  async function handleConfirmDeleteSession() {
    if (sessionId === null) return;
    try {
      await deleteSession(uid, sessionId);
      setMessages([]);
      setSessionId(null);
      setConfirmingDeleteSession(false);
    } catch {
      setDeleteError("Không thể xoá cuộc trò chuyện này lúc này, thử lại sau nhé.");
    }
  }

  return (
    <section aria-label="Trò chuyện cùng mèo" className="flex flex-col gap-4">
      {/* Hai điều bắt buộc phải thấy được TRƯỚC tin nhắn đầu tiên (design spec §3.5) — luôn
          hiện thường trực, không ẩn sau khi đã gửi tin nào. */}
      <div className="rounded-xl bg-teal-50 p-3 text-sm">
        <p className="font-medium text-teal-800">Nội dung do AI tạo</p>
        <p className="mt-1 text-slate-700">{SAFETY_SENTENCE}</p>
      </div>

      {initPhase === "loading" && (
        <p aria-busy="true" className="text-slate-600">
          Đang tải cuộc trò chuyện…
        </p>
      )}

      {initPhase === "error" && (
        <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
          <p>{INIT_ERROR_MESSAGE}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium"
          >
            Thử tải lại
          </button>
        </div>
      )}

      {initPhase === "ready" && (
        <>
          <div
            role="log"
            aria-live="polite"
            aria-label="Các tin nhắn"
            className="flex flex-col gap-3"
          >
            {messages.map((m) => {
              const isCrisis = m.role === "assistant" && m.isCrisisResponse;
              return (
                <div
                  key={m.id}
                  className={
                    isCrisis
                      ? "flex max-w-[85%] flex-col gap-2 self-start rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-3 text-rose-900"
                      : m.role === "user"
                        ? "max-w-[85%] self-end rounded-2xl bg-teal-600 px-4 py-2 text-white"
                        : "max-w-[85%] self-start rounded-2xl bg-slate-100 px-4 py-2 text-slate-800"
                  }
                >
                  {isCrisis && <p className="text-sm font-semibold">Cần trợ giúp ngay</p>}
                  <p>{m.text}</p>
                  {isCrisis && (
                    <p>
                      <a href="tel:111" className="font-medium underline">
                        Gọi Tổng đài 111
                      </a>
                    </p>
                  )}

                  {confirmingDeleteId === m.id ? (
                    <div className="flex gap-2 text-xs">
                      <span>Xoá tin này? Không thể khôi phục.</span>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)} className="underline">
                        Huỷ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteMessage(m.id)}
                        className="underline"
                      >
                        Xác nhận xoá
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(m.id)}
                      className={
                        "self-start text-xs underline " +
                        (m.role === "user" && !isCrisis ? "text-teal-100" : "text-slate-500")
                      }
                    >
                      Xoá tin này
                    </button>
                  )}
                </div>
              );
            })}

            {pendingText !== null && (
              <div className="max-w-[85%] self-end rounded-2xl bg-teal-600 px-4 py-2 text-white">
                <p>{pendingText}</p>
              </div>
            )}

            {sending && (
              <p aria-busy="true" className="text-slate-600">
                Đang trả lời…
              </p>
            )}
          </div>

          {sendError && (
            <p role="alert" className="text-rose-800">
              {sendError}
            </p>
          )}
          {deleteError && (
            <p role="alert" className="text-rose-800">
              {deleteError}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex gap-2"
          >
            <label htmlFor="chat-input" className="sr-only">
              Nhập tin nhắn
            </label>
            <input
              id="chat-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={sending}
              className="flex-1 rounded-lg border px-3 py-2"
            />
            <button
              type="submit"
              disabled={sending || draft.trim() === ""}
              className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              Gửi
            </button>
          </form>

          {messages.length > 0 && sessionId !== null && (
            <div>
              {confirmingDeleteSession ? (
                <div className="flex items-center gap-2 text-sm">
                  <span>Xoá toàn bộ cuộc trò chuyện này? Không thể khôi phục.</span>
                  <button type="button" onClick={() => setConfirmingDeleteSession(false)} className="underline">
                    Huỷ
                  </button>
                  <button type="button" onClick={handleConfirmDeleteSession} className="underline">
                    Xác nhận xoá
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteSession(true)}
                  className="text-sm text-slate-500 underline"
                >
                  Xoá cả hội thoại
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
