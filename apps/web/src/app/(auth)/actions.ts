"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { setNewPassword } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

/**
 * Sign-up, password reset and "email me a code" all work with a short code sent by email
 * (the Supabase email templates show {{ .Token }}), so nobody depends on opening a link in
 * the right browser. `step: "code"` tells the form to show the code box.
 */
export type AuthState = { error?: string; success?: string; step?: "code"; email?: string } | undefined;
export type CodePurpose = "signup" | "login" | "recovery";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const readEmail = (fd: FormData) => String(fd.get("email") ?? "").trim().toLowerCase();
const readCode = (fd: FormData) => String(fd.get("code") ?? "").replace(/\D/g, "");
const RATE = "Too many emails sent. Please wait a minute and try again.";
const BAD_CODE = "That code is wrong or has expired. Check the latest email, or send a new code.";

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      // Send a fresh code and let them finish signing up right here.
      await supabase.auth.resend({ type: "signup", email });
      return { step: "code", email, success: `Your email isn't confirmed yet. We sent a code to ${email}.` };
    }
    return { error: "Wrong email or password." };
  }

  redirect(next);
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (fullName.length < 2) return { error: "Enter your full name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });

  if (error) {
    if (error.code === "user_already_exists") return { error: "An account with this email already exists. Log in instead." };
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one." };
    if (error.code === "over_email_send_rate_limit") return { error: RATE };
    return { error: error.message };
  }

  // Email confirmation turned off in Supabase: the user is signed in already.
  if (data.session) redirect(next);

  return { step: "code", email, success: `We sent a code to ${email}. Enter it below to finish signing up.` };
}

/** "Email me a code instead": sign in without a password. Never creates an account. */
export async function sendLoginCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error?.code === "over_email_send_rate_limit") return { error: RATE };
  // Same message whether or not the account exists.
  return { step: "code", email, success: `If ${email} has an account, we've sent a sign-in code.` };
}

/** Checks the code for sign-up or code login, then signs the person in. */
export async function verifyCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const code = readCode(formData);
  const purpose = String(formData.get("purpose") ?? "") as CodePurpose;
  const next = safeNext(formData.get("next"));
  if (code.length < 6) return { step: "code", email, error: "Enter the code from the email." };

  const supabase = await createClient();
  // "email" covers both sign-up and sign-in codes; older projects still want "signup" for sign-up.
  const types: EmailOtpType[] = purpose === "signup" ? ["email", "signup"] : ["email"];
  for (const type of types) {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type });
    if (!error) redirect(next);
  }
  return { step: "code", email, error: BAD_CODE };
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error?.code === "over_email_send_rate_limit") return { error: RATE };

  // Same message whether or not the account exists, so this page can't be used to find out who has an account.
  return { step: "code", email, success: `If an account exists for ${email}, we've sent a code. Check your inbox and spam folder.` };
}

/** Code from the reset email + the new password, in one step. */
export async function resetWithCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const code = readCode(formData);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (code.length < 6) return { step: "code", email, error: "Enter the code from the email." };
  // Check the new password first, so a typo doesn't use up the code.
  if (password.length < 8) return { step: "code", email, error: "Use a password of at least 8 characters." };
  if (password !== confirm) return { step: "code", email, error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) return { step: "code", email, error: BAD_CODE };

  const problem = await setNewPassword(supabase, password, confirm);
  if (problem) return { step: "code", email, error: problem };
  redirect("/dashboard?password=updated");
}

/** "Send a new code". */
export async function resendCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const purpose = String(formData.get("purpose") ?? "") as CodePurpose;
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } =
    purpose === "signup"
      ? await supabase.auth.resend({ type: "signup", email })
      : purpose === "recovery"
        ? await supabase.auth.resetPasswordForEmail(email)
        : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) return { error: RATE };
  return { success: "New code sent. Use the latest email." };
}
