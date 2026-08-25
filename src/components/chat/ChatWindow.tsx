"use client";

import { useEffect, useState } from "react";
import {
  startChatSession,
  sendMessage,
  listMessages,
  listMySessions,
  deleteMessage,
  deleteSession,
  ChatSendError,
  type ChatMessageRecord,
  type ChatSendErrorKind,
} from "@/lib/firestore/chat";
import { getChatConsent } from "@/lib/firestore/ai-optin";
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
  // I3 (final whole-branch review): tên provider để hiện câu "nội dung em gõ được gửi ra ngoài"
  // — không suy diễn, lấy đúng aiPublic.providerLabel (cùng nguồn AiConsentSection.tsx dùng).
  const [providerLabel, setProviderLabel] = useState("");
  const [initPhase, setInitPhase] = useState<InitPhase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  // Tăng để buộc effect tải phiên chạy lại khi học sinh bấm "Thử tải lại" — gate không đổi
  // giá trị giữa hai lần nên tự nó không đủ để re-trigger effect.
  const [reloadKey, setReloadKey] = useState(0);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  // Fix round 1 (Finding 2, coordinator): giữ kèm `kind` — hết quota/rate limit không phải
  // lỗi, không được hiện màu đỏ khẩn cấp "role=alert" như lỗi gửi thật sự.
  const [sendError, setSendError] = useState<{ message: string; kind: ChatSendErrorKind } | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState(false);

  // Đọc cổng — cùng khuôn ReflectionCard.tsx: đọc đồng ý TRƯỚC, chỉ đọc tiếp
  // systemConfig/aiPublic (document nóng dùng chung toàn trường) khi đồng ý đã đủ.
  //
  // I4 (final whole-branch review): dùng getChatConsent (đòi aiConsentVersion đủ mới), KHÔNG
  // dùng getAiOptIn — một học sinh đồng ý dưới hộp thoại CŨ (trước khi chat tồn tại) không được
  // coi là đã đồng ý CHAT, dù aiOptIn của họ vẫn true. "closed" ở nhánh này hiện đúng thông báo
  // "cần bật tính năng AI trong phần Cài đặt riêng tư" — trang Hồ sơ (AiConsentSection.tsx) sẽ
  // tự hiện lại hộp thoại đồng ý (xem hasCurrentConsent ở đó) khi phát hiện version cũ.
  useEffect(() => {
    let cancelled = false;
    setGate("checking");
    (async () => {
      const hasChatConsent = await getChatConsent(uid);
      if (!hasChatConsent) {
        if (!cancelled) setGate("closed");
        return;
      }
      const aiPublic = await getAiPublicConfig();
      if (cancelled) return;
      setProviderLabel(aiPublic.providerLabel);
      // Task 9 fix round 1, Finding 2 (CRITICAL — reviewer): KHÔNG gate trên `aiPublic.enabled`
      // — cùng lý do ReflectionCard.tsx (đối xứng): bật RIÊNG phản chiếu trong khi chat vẫn tắt
      // sẽ làm enabled=true, và gate trên enabled sẽ mở luôn ô nhập chat dù killSwitch.chat vẫn
      // bật. `chatEnabled` là flag RIÊNG cho đúng tính năng này.
      setGate(aiPublic.chatEnabled ? "open" : "closed");
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

  // Fix round 1 (Finding 1, coordinator): nếu phiên vừa TẠO MỚI trong chính lần gửi vừa thất
  // bại, và không tin nào thực sự lọt vào nó (kiểm bằng listMessages, không đoán từ mã lỗi —
  // trường hợp hiếm `internal`+`details.reason==="saved"` ở chat.ts nghĩa là tin học sinh ĐÃ
  // lưu trước khi lỗi xảy ra, xoá phiên lúc đó sẽ mất tin thật), xoá luôn phiên rỗng đó và
  // đặt lại sessionId=null. Không làm vậy, một phiên rỗng mang userId của học sinh tồn tại
  // vĩnh viễn nếu học sinh không gửi lại trong tab đó — vi phạm §8.4 (xoá được cả hội thoại).
  // Dọn rác là best-effort: nếu chính bước dọn này cũng lỗi, phiên rỗng vẫn còn nhưng KHÔNG
  // còn kẹt — nút "Xoá cả hội thoại" giờ hiện với `sessionId !== null` bất kể messages có rỗng
  // hay không (fix thứ hai của cùng finding, xem điều kiện render bên dưới).
  async function cleanupOrphanSessionIfEmpty(sid: string) {
    try {
      const remaining = await listMessages(uid, sid);
      if (remaining.length === 0) {
        await deleteSession(uid, sid);
        setSessionId(null);
      }
    } catch {
      // Dọn rác thất bại không phải lỗi nghiêm trọng — xem giải thích ở trên.
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (text === "" || sending) return;

    setSending(true);
    setSendError(null);
    setPendingText(text);
    setDraft("");

    const createdSessionThisAttempt = sessionId === null;
    let sid = sessionId;
    let sendResult: { messageId: string; crisisReplyText?: string };
    try {
      if (sid === null) {
        sid = await startChatSession(uid);
        setSessionId(sid);
      }
      sendResult = await sendMessage(sid, text);
    } catch (err) {
      // Gửi thất bại: trả chữ về ô nhập để học sinh không phải gõ lại — mất một tin nhắn đã
      // lấy hết can đảm để viết còn tệ hơn chính lỗi gửi.
      const message = err instanceof Error ? err.message : GENERIC_SEND_ERROR;
      const kind = err instanceof ChatSendError ? err.kind : "error";
      setSendError({ message, kind });
      setDraft(text);
      setPendingText(null);
      setSending(false);
      if (createdSessionThisAttempt && sid !== null) {
        await cleanupOrphanSessionIfEmpty(sid);
      }
      return;
    }

    // sendMessage đã thành công — tin thật sự đã lưu (trừ nhánh I7 ngay dưới). Từ đây KHÔNG
    // được trả chữ về ô nhập nữa dù bước tải lại danh sách bên dưới có lỗi, kẻo học sinh gửi
    // trùng lặp.

    // I7 (final whole-branch review): server phanh việc GHI (client gọi lặp quá nhanh trên
    // nhánh khủng hoảng) — KHÔNG document nào được tạo, nên listMessages() bên dưới sẽ không
    // thấy gì mới. Hiện thẳng CRISIS_REPLY_TEXT server trả kèm, không phụ thuộc đọc lại
    // Firestore, để học sinh KHÔNG BAO GIỜ mất câu trả lời khủng hoảng chỉ vì bị phanh ghi.
    const crisisReplyText = sendResult.crisisReplyText;
    if (crisisReplyText !== undefined) {
      const now = new Date();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${now.getTime()}-user`,
          userId: uid,
          sessionId: sid,
          role: "user",
          text,
          isCrisisResponse: false,
          createdAt: now,
        },
        {
          id: `local-${now.getTime()}-assistant`,
          userId: uid,
          sessionId: sid,
          role: "assistant",
          text: crisisReplyText,
          isCrisisResponse: true,
          createdAt: now,
        },
      ]);
      setPendingText(null);
      setSending(false);
      return;
    }

    try {
      const refreshed = await listMessages(uid, sid);
      setMessages(refreshed);
    } catch {
      setSendError({ message: "Không thể tải tin trả lời lúc này, thử tải lại trang nhé.", kind: "error" });
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
        {/* I3 (final whole-branch review): trước fix, màn hình này không nói gì về việc tin
            nhắn RỜI KHỎI hệ thống — chỉ nói "nội dung do AI tạo" và câu an toàn. Câu này nói
            thẳng sự thật trung tâm, cùng câu chữ AiConsentSection.tsx đã dùng cho ghi chú
            cảm xúc. */}
        <p className="mt-1 text-slate-700">
          Những gì em gõ ở đây được gửi tới dịch vụ AI bên ngoài{" "}
          <strong>{providerLabel}</strong> để tạo câu trả lời.
        </p>
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

          {sendError &&
            (sendError.kind === "quota" || sendError.kind === "rate_limit" ? (
              // Hết quota/rate limit KHÔNG phải lỗi — cùng khuôn ReflectionCard.tsx dùng
              // role="status" trung tính cho thông điệp hết lượt, không phải role="alert" đỏ.
              <p role="status" className="text-slate-700">
                {sendError.message}
              </p>
            ) : (
              <p role="alert" className="text-rose-800">
                {sendError.message}
              </p>
            ))}
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

          {/* Fix round 1 (Finding 1, coordinator): gate chỉ còn phụ thuộc sessionId !== null —
              một phiên rỗng (dọn rác tự động thất bại, hoặc bất kỳ lý do nào khác) vẫn phải
              xoá được, không phải chỉ khi đã có tin nhắn. */}
          {sessionId !== null && (
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
