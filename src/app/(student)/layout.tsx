import { requireUser } from "@/lib/firebase/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
