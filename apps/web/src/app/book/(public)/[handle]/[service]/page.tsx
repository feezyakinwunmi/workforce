import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { bookRequestBase } from "@/lib/book/server";
import { LOCATION_LABEL, minutes, priceLine, type PublicPage } from "@/lib/book/types";
import { createClient } from "@/lib/supabase/server";
import { HostHeader, PoweredBy } from "../../chrome";
import { BookingFlow } from "./flow";

type Params = { params: Promise<{ handle: string; service: string }> };

async function load(handle: string, serviceId: string) {
  if (!/^[a-z0-9-]{3,30}$/i.test(handle) || !/^[0-9a-f-]{36}$/i.test(serviceId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("book_public", { p_handle: handle });
  const page = data as PublicPage | null;
  const service = page?.services.find((s) => s.id === serviceId);
  return page && service ? { page, service } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle, service } = await params;
  const x = await load(handle, service);
  return x ? { title: `${x.service.title} · ${x.page.name}` } : { title: "Not found" };
}

export default async function ServiceBookingPage({ params }: Params) {
  const { handle, service: serviceId } = await params;
  const [x, base] = await Promise.all([load(handle, serviceId), bookRequestBase()]);
  if (!x) notFound();
  const { page, service } = x;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Link href={`${base}/${page.handle}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> All services
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="card h-fit space-y-4 p-5" style={{ borderTop: `4px solid ${page.color}` }}>
          <HostHeader name={page.name} color={page.color} small />
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">{service.title}</h1>
            {service.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{service.description}</p>}
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2"><Icon name="clock" className="h-4 w-4" />{minutes(service.duration_min)}</li>
            <li className="flex items-center gap-2"><Icon name={service.location === "meet" ? "video" : service.location === "phone" ? "phone" : "pin"} className="h-4 w-4" />{LOCATION_LABEL[service.location]}</li>
            <li className="flex items-center gap-2 font-medium text-slate-800"><Icon name="wallet" className="h-4 w-4" />{priceLine(service.price_kobo, service.pay_now_kobo)}</li>
          </ul>
        </aside>
        <BookingFlow handle={page.handle} service={service} color={page.color} hostTimezone={page.timezone} canPay={page.payments} />
      </div>
      <PoweredBy pro={page.pro} base={base} />
    </div>
  );
}
