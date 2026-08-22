import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, clearSessionCookie } from "@/lib/firebase/session";

export const runtime = "nodejs";

const bodySchema = z.object({ idToken: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Thiếu idToken." }, { status: 400 });
  }

  try {
    await createSessionCookie(parsed.data.idToken);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Token không hợp lệ." }, { status: 401 });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
