import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { bookRequestBase, getBookHost } from "@/lib/book/server";
import { LOCATION_SHORT, minutes, priceLine, type HostService } from "@/lib/book/types";
import { deleteService } from "../actions";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const [{ supabase, user, page }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  if (!user || !page) redirect(base || "/");
  const { data } = await supabase
    .from("book_services")
    .select("id, title, description, duration_min, price_kobo, pay_now_kobo, location, location_detail, buffer_min, notice_min, max_days, daily_limit, active, position")
    .eq("page_id", page.id)
    .order("position")
    .order("created_at");
  const services = (data ?? []) as HostService[];
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Services</h1>
      {!page.subaccount_code && services.some((s) => s.pay_now_kobo > 0) && (
        <Notice tone="warning">Add your bank account in Settings → Payouts, or customers can't book the services that ask for payment.</Notice>
      )}
      <ul className="space-y-3">
        {services.map((s) => (
          <li key={s.id} className="card">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {s.title}
                    {!s.active && <span className="badge ml-2 bg-slate-100 text-slate-500">Hidden</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{minutes(s.duration_min)} · {LOCATION_SHORT[s.location]} · {priceLine(s.price_kobo, s.pay_now_kobo)}</p>
                </div>
                <span className="btn-secondary btn-sm">Edit</span>
              </summary>
              <div className="border-t border-slate-100 p-5">
                <ServiceForm service={s} />
                <form action={deleteService} className="mt-4 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline">
                    <Icon name="trash" className="h-4 w-4" /> Delete this service
                  </button>
                  <span className="ml-2 text-xs text-slate-500">Bookings already made stay as they are.</span>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="card" open={!services.length}>
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold text-brand-700">
          <Icon name="plus" className="h-4 w-4" /> Add a service
        </summary>
        <div className="border-t border-slate-100 p-5">
          <ServiceForm />
        </div>
      </details>
    </div>
  );
}
