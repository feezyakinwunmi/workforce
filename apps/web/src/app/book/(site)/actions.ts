"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { processBookMail } from "@/lib/book/mail";
import { bookOrigin, bookRequestBase, getBookHost } from "@/lib/book/server";
import { createSubaccount, initializeTransaction, listBanks, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, fallback = 0) => {
  const n = Number(f.get(k));
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
/** "₦5,000" / "5000" / "5,000.50" → kobo. */
const kobo = (v: string) => {
  const n = Number(v.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

function friendly(message: string) {
  if (/duplicate key.*handle|book_pages_handle_key|taken/i.test(message)) return "That address is taken. Try another.";
  if (/book_pages_handle_check/i.test(message)) return "Use 3 to 30 letters, numbers or dashes for your address.";
  if (/pay_now_kobo.*10000|check constraint.*book_services_check1/i.test(message)) return "Online payments start at ₦100.";
  if (/book_services_check/i.test(message)) return "The amount to pay now can't be more than the price.";
  if (/Unknown time zone/i.test(message)) return "Pick a time zone from the list.";
  return message;
}

async function host() {
  const h = await getBookHost();
  if (!h.user) redirect(`/login?next=${encodeURIComponent((await bookRequestBase()) || "/")}`);
  return h as typeof h & { user: NonNullable<typeof h.user> };
}

// ---------------------------------------------------------------- page

export async function createPage(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, page } = await host();
  if (page) return { error: "You already have a booking page." };
  const handle = str(form, "handle").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const { data, error } = await supabase
    .from("book_pages")
    .insert({ handle, name: str(form, "name"), timezone: str(form, "timezone") || "Africa/Lagos" })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  // A sensible start: weekdays 9:00–17:00 and one free 30-minute video call.
  const id = (data as { id: string }).id;
  await supabase.from("book_hours").insert([1, 2, 3, 4, 5].map((weekday) => ({ page_id: id, weekday, start_min: 540, end_min: 1020 })));
  await supabase.from("book_services").insert({ page_id: id, title: "30-minute call", description: "A quick video call to talk things through.", duration_min: 30, location: "meet" });
  revalidatePath("/book", "layout");
  redirect(`${await bookRequestBase()}?welcome=1`);
}

export async function savePage(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, page } = await host();
  if (!page) return { error: "Create your booking page first." };
  const patch = {
    name: str(form, "name"),
    about: str(form, "about").slice(0, 500),
    handle: str(form, "handle").toLowerCase().replace(/[^a-z0-9-]/g, ""),
    timezone: str(form, "timezone") || page.timezone,
    color: /^#[0-9a-f]{6}$/i.test(str(form, "color")) ? str(form, "color") : page.color,
    active: form.get("active") === "on",
  };
  const { error } = await supabase.from("book_pages").update(patch).eq("id", page.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/book", "layout");
  return { success: "Saved." };
}

// ---------------------------------------------------------------- services

function serviceFields(form: FormData) {
  const price = kobo(str(form, "price"));
  const payMode = str(form, "pay_mode");
  const payNow = price === 0 ? 0 : payMode === "full" ? price : payMode === "deposit" ? Math.min(kobo(str(form, "deposit")), price) : 0;
  const limit = int(form, "daily_limit", 0);
  return {
    title: str(form, "title").slice(0, 80),
    description: str(form, "description").slice(0, 1000),
    duration_min: Math.min(480, Math.max(10, int(form, "duration_min", 30))),
    price_kobo: price,
    pay_now_kobo: payNow,
    location: (["meet", "in_person", "phone"].includes(str(form, "location")) ? str(form, "location") : "meet") as "meet" | "in_person" | "phone",
    location_detail: str(form, "location_detail").slice(0, 300),
    buffer_min: Math.min(120, Math.max(0, int(form, "buffer_min", 0))),
    notice_min: Math.min(20160, Math.max(0, int(form, "notice_hours", 2) * 60)),
    max_days: Math.min(180, Math.max(1, int(form, "max_days", 60))),
    daily_limit: limit > 0 ? Math.min(50, limit) : null,
    active: !form.has("active") || form.getAll("active").includes("on"),
  };
}

export async function saveService(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, page } = await host();
  if (!page) return { error: "Create your booking page first." };
  const fields = serviceFields(form);
  if (!fields.title) return { error: "Give the service a name." };
  if (fields.pay_now_kobo > 0 && fields.pay_now_kobo < 10000) return { error: "Online payments start at ₦100." };
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("book_services").update(fields).eq("id", id).eq("page_id", page.id)
    : await supabase.from("book_services").insert({ ...fields, page_id: page.id, position: Date.now() % 1_000_000 });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/book", "layout");
  return { success: id ? "Saved." : "Service added." };
}

export async function deleteService(form: FormData) {
  const { supabase, page } = await host();
  if (!page) return;
  await supabase.from("book_services").delete().eq("id", str(form, "id")).eq("page_id", page.id);
  revalidatePath("/book", "layout");
}

// ---------------------------------------------------------------- availability

export async function saveHours(hours: Array<{ weekday: number; start_min: number; end_min: number }>): Promise<FormState> {
  const { supabase, page } = await host();
  if (!page) return { error: "Create your booking page first." };
  const clean = hours
    .filter((h) => h.weekday >= 0 && h.weekday <= 6 && h.end_min > h.start_min && h.start_min >= 0 && h.end_min <= 1440)
    .slice(0, 50)
    .map((h) => ({ page_id: page.id, weekday: h.weekday, start_min: h.start_min, end_min: h.end_min }));
  const { error: delError } = await supabase.from("book_hours").delete().eq("page_id", page.id);
  if (delError) return { error: delError.message };
  if (clean.length) {
    const { error } = await supabase.from("book_hours").insert(clean);
    if (error) return { error: error.message };
  }
  revalidatePath("/book", "layout");
  return { success: "Your hours are saved." };
}

export async function addDayOff(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, page } = await host();
  if (!page) return { error: "Create your booking page first." };
  const from = str(form, "from");
  const to = str(form, "to") || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { error: "Pick the first and last day." };
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`) && days.length < 62; d = new Date(d.getTime() + 86_400_000)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const { error } = await supabase.from("book_days_off").upsert(days.map((day) => ({ page_id: page.id, day })), { onConflict: "page_id,day", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath("/book", "layout");
  return { success: days.length === 1 ? "Day off added." : `${days.length} days off added.` };
}

export async function removeDayOff(form: FormData) {
  const { supabase, page } = await host();
  if (!page) return;
  await supabase.from("book_days_off").delete().eq("page_id", page.id).eq("day", str(form, "day"));
  revalidatePath("/book", "layout");
}

// ---------------------------------------------------------------- bookings

export async function updateBooking(form: FormData) {
  const { supabase } = await host();
  const status = str(form, "status");
  await supabase.rpc("book_update_status", { p_booking: str(form, "id"), p_status: status, p_reason: str(form, "reason") });
  if (status === "cancelled") after(() => processBookMail());
  revalidatePath("/book", "layout");
}

// ---------------------------------------------------------------- payouts

export async function banks() {
  if (!paystackConfigured()) return [];
  try {
    return await listBanks();
  } catch {
    return [];
  }
}

export async function checkAccount(bankCode: string, accountNumber: string): Promise<{ name?: string; error?: string }> {
  await host();
  if (!/^\d{10}$/.test(accountNumber)) return { error: "Account numbers have 10 digits." };
  if (!paystackConfigured()) return { error: "Payments aren't set up on this site yet." };
  const name = await resolveAccount(accountNumber, bankCode).catch(() => null);
  return name ? { name } : { error: "We couldn't find that account. Check the number and the bank." };
}

export async function savePayout(_: FormState, form: FormData): Promise<FormState> {
  const { user, page } = await host();
  if (!page) return { error: "Create your booking page first." };
  if (!paystackConfigured()) return { error: "Payments aren't set up on this site yet." };
  const bankCode = str(form, "bank");
  const account = str(form, "account").replace(/\D/g, "");
  if (!/^\d{10}$/.test(account)) return { error: "Account numbers have 10 digits." };
  const list = await listBanks().catch(() => []);
  const bank = list.find((b) => b.code === bankCode);
  if (!bank) return { error: "Pick your bank." };
  const accountName = await resolveAccount(account, bankCode).catch(() => null);
  if (!accountName) return { error: "We couldn't find that account. Check the number and the bank." };
  try {
    const code = await createSubaccount({ businessName: page.name, bankCode, accountNumber: account });
    const { error } = await createAdminClient().rpc("book_set_payout", {
      p_user: user.id, p_code: code, p_bank: bank.name, p_last4: account.slice(-4), p_account_name: accountName,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Paystack didn't accept this account." };
  }
  revalidatePath("/book", "layout");
  return { success: `Payments will go to ${accountName} (${bank.name} ••••${account.slice(-4)}).` };
}

// ---------------------------------------------------------------- Book Pro

export async function payPro(form: FormData) {
  const { supabase } = await host();
  const base = await bookRequestBase();
  const months = Number(form.get("months"));
  const { data, error } = await supabase.rpc("book_start_payment", { p_months: months });
  if (error) redirect(`${base}/settings?payment=${encodeURIComponent(error.message)}#plan`);
  const d = data as { reference: string; amount_kobo: number; email: string };
  let url: string;
  try {
    url = await initializeTransaction({
      email: d.email,
      amountKobo: d.amount_kobo,
      reference: d.reference,
      callbackUrl: `${await bookOrigin()}${base}/pay/callback`,
      metadata: { product: "workbase-book-pro", months },
    });
  } catch (e) {
    redirect(`${base}/settings?payment=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't start the payment")}#plan`);
  }
  redirect(url);
}
