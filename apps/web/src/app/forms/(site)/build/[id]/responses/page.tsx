import { Icon } from "@/components/icons";
import { AMOUNT_KEY, answerText, isFileAnswer, isStatic, naira, type Answers } from "@/lib/forms/schema";
import { formsRequestBase, myForm } from "@/lib/forms/server";
import { cn } from "@/lib/utils";
import { deleteResponse } from "../../../actions";

export const metadata = { title: "Answers" };

type Row = { id: string; answers: Answers; amount_kobo: number; status: string; created_at: string; page: string };

export default async function ResponsesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [{ supabase, form }, base] = await Promise.all([myForm(id), formsRequestBase()]);
  let q = supabase.from("form_responses").select("id, answers, amount_kobo, status, created_at, page").eq("form_id", form.id);
  if (sp.show !== "all") q = q.neq("status", "pending_payment");
  const { data } = await q.order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as Row[];
  const questions = form.fields.filter((f) => !isStatic(f.type));
  const priced = Boolean(form.settings.payment?.enabled) || rows.some((r) => r.amount_kobo > 0);
  const custom = rows.some((r) => r.answers[AMOUNT_KEY] !== undefined);
  const paidTotal = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_kobo, 0);
  const root = `${base}/build/${form.id}/responses`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-600">
          <span className="font-display text-2xl font-bold text-slate-900">{rows.length}</span> {rows.length === 1 ? "answer" : "answers"}
          {priced && <> · <span className="font-medium text-slate-900">{naira(paidTotal)}</span> paid</>}
        </p>
        {priced && (
          <a href={sp.show === "all" ? root : `${root}?show=all`} className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900">
            {sp.show === "all" ? "Hide unfinished payments" : "Show unfinished payments too"}
          </a>
        )}
        <a href={`${root}/export`} className="btn-secondary btn-sm ml-auto"><Icon name="download" className="h-4 w-4" /> Download CSV</a>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-6 px-6 py-14 text-center text-slate-500">No answers yet. Share the form from the Share tab.</div>
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Sent</th>
                {questions.map((f) => (
                  <th key={f.id} className="max-w-[16rem] truncate px-4 py-3 font-medium" title={f.label}>{f.label}</th>
                ))}
                {custom && <th className="px-4 py-3 font-medium">Amount typed</th>}
                {priced && <th className="px-4 py-3 font-medium">Payment</th>}
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r.id} className={cn("align-top", r.status === "pending_payment" && "text-slate-400")}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}
                  </td>
                  {questions.map((f) => (
                    <td key={f.id} className="max-w-[20rem] px-4 py-3 break-words whitespace-pre-wrap text-slate-800">
                      {isFileAnswer(r.answers[f.id]) ? (
                        <a href={`${base}/build/${form.id}/file?p=${encodeURIComponent((r.answers[f.id] as { path: string }).path)}`} target="_blank" rel="noopener"
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-brand-50 hover:text-brand-700">
                          <Icon name="paperclip" className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{answerText(r.answers[f.id], f.type)}</span>
                        </a>
                      ) : answerText(r.answers[f.id], f.type)}
                    </td>
                  ))}
                  {custom && <td className="px-4 py-3">{r.answers[AMOUNT_KEY] ? naira(Number(r.answers[AMOUNT_KEY])) : ""}</td>}
                  {priced && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.amount_kobo === 0 ? "" : (
                        <span className={cn("badge", r.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {naira(r.amount_kobo)} {r.status === "paid" ? "paid" : "not paid"}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <form action={deleteResponse}>
                      <input type="hidden" name="id" value={r.id} />
                      <button aria-label="Delete this answer" title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 500 && <p className="mt-3 text-sm text-slate-500">Showing the newest 500. The CSV has all of them.</p>}
    </div>
  );
}
