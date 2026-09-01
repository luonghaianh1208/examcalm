import { requireUser } from "@/lib/firebase/session";
import { ChatWindow } from "@/components/chat/ChatWindow";

export const metadata = { title: "Trò chuyện" };

export default async function Page() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">Trò chuyện cùng mèo</h1>
      <ChatWindow uid={user.uid} />
    </div>
  );
}
