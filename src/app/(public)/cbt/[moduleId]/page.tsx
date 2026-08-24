import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCbtModule } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { CbtRunner } from "@/components/cbt/CbtRunner";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: PageProps<"/cbt/[moduleId]">,
): Promise<Metadata> {
  const { moduleId } = await params;
  const mod = await getPublishedCbtModule(moduleId);
  return { title: mod ? mod.title : "Không tìm thấy" };
}

export default async function CbtModulePage({ params }: PageProps<"/cbt/[moduleId]">) {
  const { moduleId } = await params;
  const mod = await getPublishedCbtModule(moduleId);
  if (!mod) notFound();

  const user = await getSessionUser();

  return (
    <main>
      <CbtRunner
        module={mod}
        uid={user?.uid ?? null}
        canSave={Boolean(user?.emailVerified)}
      />
    </main>
  );
}
