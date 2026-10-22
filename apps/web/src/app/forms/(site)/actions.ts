"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeForm, TEMPLATES } from "@/lib/forms/schema";
import { formsRequestBase, requireMaker } from "@/lib/forms/server";
import { createSubaccount, listBanks, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/types";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function friendly(message: string) {
  if (/going too fast/i.test(message)) return "You've made a lot of forms in the last hour. Try again a bit later.";
  if (/check constraint/i.test(message)) return "This form is too big. Remove some questions or options.";
  return message;
}

// ---------------------------------------------------------------- forms

export async function createForm(form: FormData) {
  const { supabase } = await requireMaker();
  const base = await formsRequestBase();
  const t = TEMPLATES.find((x) => x.key === form.get("template")) ?? TEMPLATES[0];
  const def = sanitizeForm(t.make());
  const { data, error } = await supabase.from("forms").insert(def).select("id").single();
  if (error) redirect(`${base || "/"}?error=${encodeURIComponent(friendly(error.message))}`);
  redirect(`${base}/build/${(data as { id: string }).id}`);
}

export async function duplicateForm(form: FormData) {
  const { supabase } = await requireMaker();
  const base = await formsRequestBase();
  const id = form.get("id");
  if (!isId(id)) return;
  const { data: src } = await supabase.from("forms").select("title, description, fields, settings").eq("id", id).maybeSingle();
  if (!src) return;
  const def = sanitizeForm(src);
  const { data, error } = await supabase.from("forms").insert({ ...def, title: `${def.title} (copy)`.slice(0, 120) }).select("id").single();
  if (error) redirect(`${base || "/"}?error=${encodeURIComponent(friendly(error.message))}`);
  redirect(`${base}/build/${(data as { id: string }).id}`);
}

/** Autosave from the builder. */
export async function saveForm(id: string, raw: unknown): Promise<{ ok?: true; error?: string }> {
  const { supabase } = await requireMaker();
  if (!isId(id)) return { error: "Unknown form." };
  const def = sanitizeForm(raw);
  const { data, error } = await supabase.from("forms").update(def).eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "You can't change this form." };
  return { ok: true };
}

export async function setFormFlags(id: string, flags: { published?: boolean; accepting?: boolean }): Promise<{ ok?: true; error?: string }> {
  const { supabase } = await requireMaker();
  if (!isId(id)) return { error: "Unknown form." };
  const patch: Record<string, boolean> = {};
  if (typeof flags.published === "boolean") patch.published = flags.published;
  if (typeof flags.accepting === "boolean") patch.accepting = flags.accepting;
  const { data, error } = await supabase.from("forms").update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change this form." };
  revalidatePath("/forms", "layout");
  return { ok: true };
}

export async function deleteForm(form: FormData) {
  const { supabase } = await requireMaker();
  const id = form.get("id");
  if (isId(id)) await supabase.from("forms").delete().eq("id", id);
  redirect((await formsRequestBase()) || "/");
}

export async function deleteResponse(form: FormData) {
  const { supabase } = await requireMaker();
  const id = form.get("id");
  if (isId(id)) await supabase.from("form_responses").delete().eq("id", id);
  revalidatePath("/forms", "layout");
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
  await requireMaker();
  if (!/^\d{10}$/.test(accountNumber)) return { error: "Account numbers have 10 digits." };
  if (!paystackConfigured()) return { error: "Payments aren't set up on this site yet." };
  const name = await resolveAccount(accountNumber, bankCode).catch(() => null);
  return name ? { name } : { error: "We couldn't find that account. Check the number and the bank." };
}

export async function savePayout(_: FormState, form: FormData): Promise<FormState> {
  const { user, name } = await requireMaker();
  if (!paystackConfigured()) return { error: "Payments aren't set up on this site yet." };
  const bankCode = String(form.get("bank") ?? "");
  const account = String(form.get("account") ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(account)) return { error: "Account numbers have 10 digits." };
  const list = await listBanks().catch(() => []);
  const bank = list.find((b) => b.code === bankCode);
  if (!bank) return { error: "Pick your bank." };
  const accountName = await resolveAccount(account, bankCode).catch(() => null);
  if (!accountName) return { error: "We couldn't find that account. Check the number and the bank." };
  try {
    const business = String(form.get("business") ?? "").trim() || name || accountName;
    const code = await createSubaccount({ businessName: business, bankCode, accountNumber: account });
    const { error } = await createAdminClient().rpc("form_set_payout", {
      p_user: user.id, p_code: code, p_bank: bank.name, p_last4: account.slice(-4), p_account_name: accountName,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Paystack didn't accept this account." };
  }
  revalidatePath("/forms", "layout");
  return { success: `Payments will go to ${accountName} (${bank.name} ••••${account.slice(-4)}).` };
}

/** Use the bank account already set up for Workbase Book. */
export async function copyBookPayout(): Promise<FormState> {
  const { supabase, user } = await requireMaker();
  const { data } = await supabase
    .from("book_pages")
    .select("subaccount_code, bank_name, account_last4, account_name")
    .eq("owner_id", user.id)
    .maybeSingle();
  const p = data as { subaccount_code: string | null; bank_name: string; account_last4: string; account_name: string } | null;
  if (!p?.subaccount_code) return { error: "Your Book page has no bank account yet." };
  const { error } = await createAdminClient().rpc("form_set_payout", {
    p_user: user.id, p_code: p.subaccount_code, p_bank: p.bank_name, p_last4: p.account_last4, p_account_name: p.account_name,
  });
  if (error) return { error: error.message };
  revalidatePath("/forms", "layout");
  return { success: `Payments will go to ${p.account_name} (${p.bank_name} ••••${p.account_last4}).` };
}
