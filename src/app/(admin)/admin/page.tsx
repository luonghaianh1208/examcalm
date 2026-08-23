import Link from "next/link";

export const metadata = { title: "Quản trị" };

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản trị</h1>
      <p className="mb-4 text-slate-600">Chọn một mục trong menu bên trên để bắt đầu.</p>
      <Link href="/admin/tests" className="underline">Quản lý bài test</Link>
    </>
  );
}
