import { requireUser } from "@/lib/firebase/session";
import { WebAppHelpChat } from "@/components/chat/WebAppHelpChat";

export const metadata = { title: "Hỏi về web app" };

export default async function Page() {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      {/*
        Tên hiển thị trong navigation vẫn là "Trò chuyện AI với Meo" theo mục 1
        của motion spec (không đổi tên tính năng), còn "Hỏi về web app" là nhãn
        của chính bề mặt này theo §6.2. Hai nhãn khác nhau là cố ý.
      */}
      <h1 className="text-2xl font-semibold text-ink">Hỏi về web app</h1>
      <WebAppHelpChat />
    </div>
  );
}
