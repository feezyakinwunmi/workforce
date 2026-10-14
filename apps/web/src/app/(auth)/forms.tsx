"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth-shell";
import { FormMessage, PasswordInput, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { login, requestPasswordReset, signup } from "./actions";

export function LoginForm({ next, email }: { next: string; email?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Welcome back">Log in to your Workbase.</AuthHeading>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label>
          <Link className="text-xs font-medium text-brand-700 hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Logging in…">Log in</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-medium text-brand-700 hover:underline" href={`/signup?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ next, email }: { next: string; email?: string }) {
  const [state, action] = useActionState(signup, undefined);

  if (state?.success) {
    return (
      <div className="space-y-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:text-brand-700">
          <Icon name="mail" className="h-6 w-6" />
        </span>
        <AuthHeading title="Check your email">{state.success}</AuthHeading>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Create your account">14 days of Standard free. No card needed.</AuthHeading>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input className="input" id="full_name" name="full_name" autoComplete="name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-xs text-slate-500">
        By creating an account you agree to the{" "}
        <Link className="underline hover:text-slate-800" href="/terms" target="_blank">terms</Link> and{" "}
        <Link className="underline hover:text-slate-800" href="/privacy" target="_blank">privacy policy</Link>.
      </p>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-medium text-brand-700 hover:underline" href={`/login?next=${encodeURIComponent(next)}`}>
          Log in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);

  if (state?.success) {
    return (
      <div className="space-y-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:text-brand-700">
          <Icon name="mail" className="h-6 w-6" />
        </span>
        <AuthHeading title="Check your email">{state.success}</AuthHeading>
        <Link className="btn-secondary w-full" href="/login">Back to log in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Reset your password">We&apos;ll email you a link to choose a new one.</AuthHeading>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Sending…">Send reset link</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Remembered it? <Link className="font-medium text-brand-700 hover:underline" href="/login">Log in</Link>
      </p>
    </form>
  );
}
