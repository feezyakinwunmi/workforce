import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, LEGAL_UPDATED, OPERATOR_NAME, SUPPORT_EMAIL } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {LEGAL_UPDATED}</p>

      <p>
        These terms are an agreement between {OPERATOR_NAME} (&ldquo;we&rdquo;) and the company or person who creates a{" "}
        {APP_NAME} account (&ldquo;you&rdquo;). By creating an account or using the service you accept them.
      </p>

      <h2>1. The service</h2>
      <p>
        {APP_NAME} records work time, computer activity while clocked in, tasks and reports, and shows them in a
        dashboard and a desktop app. We may improve or change features over time.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Keep your password safe. You are responsible for what happens under your account.</li>
        <li>The person who creates a company account confirms they may act for that company.</li>
        <li>Company owners and admins decide who joins and what they can see.</li>
      </ul>

      <h2>3. Using it fairly and lawfully</h2>
      <p>If you are a company using {APP_NAME} to track your team, you agree to:</p>
      <ul>
        <li>Tell your workers that their work is tracked and what is recorded (the app shows them a notice and our{" "}
          <Link href="/what-we-track">what we track</Link> page before tracking starts).</li>
        <li>Have a lawful basis for tracking under the laws that apply to you and your workers, including the Nigeria
          Data Protection Act 2023 and, where relevant, the GDPR and local employment law.</li>
        <li>Only track people who work for you, only during working time, and never install the app on someone&apos;s
          computer without their knowledge.</li>
        <li>Answer your workers&apos; requests to see, correct or delete their data.</li>
      </ul>
      <p>You must not use the service to break the law, harass anyone, or try to access another company&apos;s data.</p>

      <h2>4. Your data</h2>
      <p>
        Your company&apos;s data belongs to you. We process it only to provide the service, as described in the{" "}
        <Link href="/privacy">privacy policy</Link>. You can export timesheets at any time. When you close your account,
        we delete your data within 90 days.
      </p>

      <h2>5. Plans and payment</h2>
      <p>
        New companies start on a free trial. Paid plans are charged per active member, in naira for companies based in
        Nigeria and in US dollars elsewhere. Prices and plan details are shown before you pay. Paid plans renew until
        cancelled; cancelling stops the next renewal.
      </p>

      <h2>6. Availability</h2>
      <p>
        We work to keep the service running and your data safe, but we cannot promise it will always be available or
        free of errors. The desktop app keeps working offline and uploads time when the connection returns.
      </p>

      <h2>7. Liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for indirect losses
        such as lost profits, and our total liability is limited to the amount you paid us in the 12 months before the
        claim. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>8. Ending the agreement</h2>
      <p>
        You can stop using the service and close your account at any time. We may suspend accounts that break these
        terms, after a warning where reasonable.
      </p>

      <h2>9. Changes and law</h2>
      <p>
        We may update these terms and will tell company owners about important changes before they apply. These terms
        are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction.
      </p>

      <h2>10. Contact</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </article>
  );
}
