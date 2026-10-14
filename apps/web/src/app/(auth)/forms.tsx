"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { login, requestPasswordReset, signup } from "./actions";

export function LoginForm({ next, email }: { next: string; email?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="card space-y-4 p-6">
      <h1 className="text-xl font-semibold">Log in</h1>
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
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Logging in…">Log in</SubmitButton>
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
      <div className="card space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <h1 className="text-xl font-semibold">Create your account</h1>
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
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
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
      <div className="card space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">{state.success}</p>
        <Link className="text-sm font-medium text-brand-700 hover:underline" href="/login">Back to log in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-600">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">Send reset link</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Remembered it? <Link className="font-medium text-brand-700 hover:underline" href="/login">Log in</Link>
      </p>
    </form>
  );
}
