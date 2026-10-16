import { redirect } from "next/navigation";
import { CODE_VALID_HOURS, requireAdminAccount } from "@/lib/admin/server";
import { CodeStep } from "./code-step";

export const metadata = { title: "Enter your code" };
export const dynamic = "force-dynamic";

/** The second step: a code from an authenticator app (set up the first time). */
export default async function VerifyPage() {
  const { base, fresh, codeAt } = await requireAdminAccount();
  if (fresh) redirect(base || "/");
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-12">
      <CodeStep home={base || "/"} expired={codeAt !== null} hours={CODE_VALID_HOURS} />
    </main>
  );
}
