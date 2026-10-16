"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import type { HostService } from "@/lib/book/types";
import { saveService } from "../actions";

const nairaValue = (kobo: number) => (kobo ? String(kobo / 100) : "");

export function ServiceForm({ service }: { service?: HostService }) {
  const [state, action] = useActionState(saveService, undefined);
  const [location, setLocation] = useState(service?.location ?? "meet");
  const [price, setPrice] = useState(nairaValue(service?.price_kobo ?? 0));
  const [payMode, setPayMode] = useState(
    !service || !service.price_kobo || !service.pay_now_kobo ? "later" : service.pay_now_kobo >= service.price_kobo ? "full" : "deposit",
  );
  const paid = Number(price.replace(/[₦,\s]/g, "")) > 0;
  return (
    <form action={action} className="space-y-4">
      {service && <input type="hidden" name="id" value={service.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <label className="block">
          <span className="label">Name</span>
          <input name="title" required maxLength={80} defaultValue={service?.title} placeholder="e.g. Skin consultation" className="input" />
        </label>
        <label className="block">
          <span className="label">Length (minutes)</span>
          <input name="duration_min" type="number" min={10} max={480} step={5} required defaultValue={service?.duration_min ?? 30} className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">Description (optional)</span>
        <textarea name="description" rows={2} maxLength={1000} defaultValue={service?.description} className="input" />
      </label>

      <fieldset>
        <legend className="label">Where</legend>
        <div className="flex flex-wrap gap-2">
          {([["meet", "Video call"], ["in_person", "In person"], ["phone", "Phone call"]] as const).map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="location" value={v} checked={location === v} onChange={() => setLocation(v)} />
              {l}
            </label>
          ))}
        </div>
        {location === "meet" && <p className="mt-2 text-xs text-slate-500">Each booking gets its own Workbase Meet link.</p>}
        {location !== "meet" && (
          <input
            name="location_detail"
            maxLength={300}
            defaultValue={service?.location_detail}
            placeholder={location === "in_person" ? "Address, e.g. 12 Allen Avenue, Ikeja" : "Optional: number to call, or leave empty to call them"}
            className="input mt-2"
          />
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Price (₦, empty = free)</span>
          <input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="input" />
        </label>
        {paid && (
          <label className="block">
            <span className="label">When do they pay?</span>
            <select name="pay_mode" value={payMode} onChange={(e) => setPayMode(e.target.value)} className="input">
              <option value="later">On the day (not online)</option>
              <option value="deposit">Deposit online, rest on the day</option>
              <option value="full">Full price online when booking</option>
            </select>
          </label>
        )}
        {paid && payMode === "deposit" && (
          <label className="block">
            <span className="label">Deposit (₦)</span>
            <input name="deposit" inputMode="decimal" required defaultValue={nairaValue(service?.pay_now_kobo ?? 0)} placeholder="e.g. 5000" className="input" />
          </label>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">More options</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Gap after each booking (min)</span>
            <input name="buffer_min" type="number" min={0} max={120} step={5} defaultValue={service?.buffer_min ?? 0} className="input" />
          </label>
          <label className="block">
            <span className="label">Book at least (hours ahead)</span>
            <input name="notice_hours" type="number" min={0} max={336} defaultValue={Math.round((service?.notice_min ?? 120) / 60)} className="input" />
          </label>
          <label className="block">
            <span className="label">Book up to (days ahead)</span>
            <input name="max_days" type="number" min={1} max={180} defaultValue={service?.max_days ?? 60} className="input" />
          </label>
          <label className="block">
            <span className="label">Most bookings a day (empty = no limit)</span>
            <input name="daily_limit" type="number" min={1} max={50} defaultValue={service?.daily_limit ?? ""} className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="hidden" name="active" value="off" />
            <input type="checkbox" name="active" value="on" defaultChecked={service?.active ?? true} />
            Show on my booking page
          </label>
        </div>
      </details>

      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">{service ? "Save" : "Add service"}</SubmitButton>
    </form>
  );
}
