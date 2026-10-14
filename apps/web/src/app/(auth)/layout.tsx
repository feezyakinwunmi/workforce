import { APP_NAME } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            {APP_NAME[0]}
          </div>
          <p className="text-sm font-semibold tracking-wide text-slate-500">{APP_NAME}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
