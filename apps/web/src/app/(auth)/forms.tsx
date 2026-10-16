"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AuthHeading } from "@/components/auth-shell";
import { FormMessage, PasswordInput, SubmitButton } from "@/components/form";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { Icon } from "@/components/icons";
import {
  login,
  requestPasswordReset,
  resendCode,
  resetWithCode,
  sendLoginCode,
  signup,
  verifyCode,
  type AuthState,
  type CodePurpose,
} from "./actions";

/** Shows the code step while the latest answer asks for it, until "Use a different email". */
function useCodeStep(state: AuthState) {
  const [dismissed, setDismissed] = useState<AuthState>(undefined);
  const show = Boolean(state?.step === "code" && state !== dismissed);
  return { show, back: () => setDismissed(state) };
}

function CodeInput() {
  return (
    <input
      className="input text-center font-display text-2xl tracking-[0.4em] tabular-nums"
      id="code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      minLength={6}
      maxLength={12}
      placeholder="••••••"
      autoFocus
      required
    />
  );
}

/** Second step: type the code from the email (and, for a reset, the new password). */
function CodeStep({ purpose, email, next = "/dashboard", message, onBack }: { purpose: CodePurpose; email: string; next?: string; message?: string; onBack: () => void }) {
  const [state, action] = useActionState(purpose === "recovery" ? resetWithCode : verifyCode, undefined);
  const [resent, resend] = useActionState(resendCode, undefined);
  const titles: Record<CodePurpose, string> = { signup: "Check your email", login: "Enter your code", recovery: "Choose a new password" };
  return (
    <div className="space-y-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:text-brand-700">
        <Icon name="mail" className="h-6 w-6" />
      </span>
      <AuthHeading title={titles[purpose]}>{message ?? `We sent a code to ${email}.`}</AuthHeading>
      <form action={action} className="space-y-5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="code">Code from the email</label>
          <CodeInput />
        </div>
        {purpose === "recovery" && (
          <>
            <div>
              <label className="label" htmlFor="password">New password</label>
              <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="label" htmlFor="confirm">New password again</label>
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} />
            </div>
          </>
        )}
        <FormMessage state={state?.error ? state : undefined} />
        <SubmitButton className="btn-primary w-full py-2.5" pendingText="Checking…">
          {purpose === "recovery" ? "Save new password" : purpose === "signup" ? "Confirm and continue" : "Log in"}
        </SubmitButton>
      </form>
      <form action={resend} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        <FormMessage state={resent} />
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="text-slate-500 hover:text-slate-900" onClick={onBack}>Use a different email</button>
          <SubmitButton className="font-medium text-brand-700 hover:underline" pendingText="Sending…">Send a new code</SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function LoginForm({ next, email, google = false }: { next: string; email?: string; google?: boolean }) {
  const [state, action] = useActionState(login, undefined);
  const step = useCodeStep(state);
  const [withCode, setWithCode] = useState(false);

  if (step.show && state?.email) return <CodeStep purpose="signup" email={state.email} next={next} message={state.success} onBack={step.back} />;
  if (withCode) return <LoginCodeForm next={next} email={email} onPassword={() => setWithCode(false)} />;

  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Welcome back">Log in to your Workbase.</AuthHeading>
      <input type="hidden" name="next" value={next} />
      {google && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
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
      <button type="button" className="btn-secondary w-full py-2.5" onClick={() => setWithCode(true)}>
        <Icon name="mail" className="h-4 w-4" />
        Email me a code instead
      </button>
      <p className="text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-medium text-brand-700 hover:underline" href={`/signup?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

function LoginCodeForm({ next, email, onPassword }: { next: string; email?: string; onPassword: () => void }) {
  const [state, action] = useActionState(sendLoginCode, undefined);
  const step = useCodeStep(state);
  if (step.show && state?.email) return <CodeStep purpose="login" email={state.email} next={next} message={state.success} onBack={step.back} />;
  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Log in with a code">We&apos;ll email you a code. No password needed.</AuthHeading>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={email} autoFocus required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Sending…">Send me a code</SubmitButton>
      <button type="button" className="w-full text-center text-sm font-medium text-brand-700 hover:underline" onClick={onPassword}>
        Use my password instead
      </button>
    </form>
  );
}

export function SignupForm({ next, email, google = false }: { next: string; email?: string; google?: boolean }) {
  const [state, action] = useActionState(signup, undefined);
  const step = useCodeStep(state);

  if (step.show && state?.email) return <CodeStep purpose="signup" email={state.email} next={next} message={state.success} onBack={step.back} />;

  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Create your account">14 days of Standard free. No card needed.</AuthHeading>
      <input type="hidden" name="next" value={next} />
      {google && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input className="input" id="full_name" name="full_name" autoComplete="name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={state?.email ?? email} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
      </div>
      <FormMessage state={state?.step ? undefined : state} />
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
  const step = useCodeStep(state);

  if (step.show && state?.email) return <CodeStep purpose="recovery" email={state.email} message={state.success} onBack={step.back} />;

  return (
    <form action={action} className="space-y-5">
      <AuthHeading title="Reset your password">We&apos;ll email you a code to choose a new one.</AuthHeading>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
      </div>
      <FormMessage state={state?.step ? undefined : state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Sending…">Send me a code</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Remembered it? <Link className="font-medium text-brand-700 hover:underline" href="/login">Log in</Link>
      </p>
    </form>
  );
}
