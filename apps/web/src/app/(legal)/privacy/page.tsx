import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, LEGAL_UPDATED, OPERATOR_NAME, SUPPORT_EMAIL } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
  return (
    <article>
      <h1>Privacy policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {LEGAL_UPDATED}</p>

      <p>
        {APP_NAME} is a service run by {OPERATOR_NAME} (&ldquo;we&rdquo;). Companies use it to record the working time,
        computer activity and tasks of their team. This policy explains what we collect, why, where it is kept and the
        rights you have. It is written to meet the Nigeria Data Protection Act 2023 and, for people in the UK and the
        European Union, the GDPR.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        <strong>If you work for a company that uses {APP_NAME}</strong>, that company decides to track work time and
        decides who sees it. The company is the <em>data controller</em> and we process the data on its behalf, as a{" "}
        <em>data processor</em>. Questions about why your company tracks work, or requests to see or delete your data,
        go to your employer first. We help them answer.
      </p>
      <p>
        <strong>For account holders and visitors</strong> (for example the person who signs a company up), we are the
        controller of the account and billing details we need to run the service.
      </p>

      <h2>2. What we collect</h2>
      <h3>Account details</h3>
      <ul>
        <li>Name, email address, password (stored only as a secure hash by our database provider)</li>
        <li>Company name, country, time zone, your role and team, job title and expected hours</li>
      </ul>
      <h3>Work data, recorded by the desktop app only while you are clocked in</h3>
      <ul>
        <li>Clock-in and clock-out times</li>
        <li>For each 10-second check, whether the keyboard or mouse was used (yes or no only)</li>
        <li>Away-from-computer periods and your answer about them</li>
        <li>The name of the app in front and its window title, if your company turned app tracking on</li>
        <li>The task you are working on, your end-of-day report, tasks and comments you write</li>
        <li>Chat messages and files you choose to send. Direct messages and private groups can only be read by the people in them, not by company admins.</li>
        <li>The computer&apos;s name, operating system, app version and clock difference, to keep data accurate</li>
      </ul>
      <p>
        We never record keystroke content, passwords, messages, screenshots, the webcam, the microphone, the files on your computer or
        location, and nothing at all while you are clocked out. See <Link href="/what-we-track">what we track</Link>.
      </p>
      <h3>Technical data</h3>
      <ul>
        <li>Login sessions and security logs kept by our hosting providers, including IP addresses</li>
      </ul>

      <h2>3. Why we use it (legal basis)</h2>
      <ul>
        <li><strong>To provide the service the company signed up for</strong>: showing hours, activity, tasks and timesheets (contract with the company; the company relies on its own lawful basis, usually its employment or service contract and legitimate interest in managing paid work time).</li>
        <li><strong>To keep the service secure</strong> and prevent abuse (legitimate interest).</li>
        <li><strong>To send service emails</strong> such as password resets and task notifications (contract).</li>
        <li><strong>To meet legal obligations</strong>, for example tax records for paid plans.</li>
      </ul>
      <p>We do not sell personal data, show advertising, or use work data to build profiles for anyone else.</p>

      <h2>4. Who can see it</h2>
      <ul>
        <li>You can see all of your own work data in the dashboard.</li>
        <li>Within your company: managers see their teams; the owner and admins see everyone.</li>
        <li>Our staff only when needed to support the company or keep the service running, under confidentiality.</li>
        <li>Service providers that host the service for us (below), under contracts that protect the data.</li>
        <li>Authorities, only when the law requires it.</li>
      </ul>

      <h2>5. Where it is stored and service providers</h2>
      <ul>
        <li><strong>Supabase</strong>: database and logins, hosted in the European Union (Ireland).</li>
        <li><strong>Vercel</strong>: hosts the dashboard website.</li>
        <li><strong>GitHub</strong>: hosts the desktop app installer downloads (no work data).</li>
        <li><strong>Our email provider</strong>: delivers service emails.</li>
      </ul>
      <p>
        Data may be processed outside Nigeria, including in the European Union and the United States. We use
        providers that offer recognised safeguards for such transfers, as required by the Nigeria Data Protection Act
        and the GDPR.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Work data is kept while the company&apos;s account is active, so it can review past timesheets.</li>
        <li>Notifications are deleted after 90 days.</li>
        <li>When a company closes its account, we delete its data within 90 days, except what the law requires us to keep.</li>
        <li>Data on your own computer that has not been uploaded is deleted when you log out of the app.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit (HTTPS). Every company&apos;s data is kept apart by rules inside the database, so
        one company can never read another&apos;s. The desktop app stores your login encrypted by your operating system.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can ask to see a copy of your data, correct it, delete it, restrict or object to its use, or receive it in
        a portable format. If you work for a company that uses {APP_NAME}, send the request to your employer or to us at{" "}
        {mail}; we will work with your employer and answer within 30 days. You can also complain to the Nigeria Data
        Protection Commission (NDPC) or your local data protection authority.
      </p>

      <h2>9. Children</h2>
      <p>{APP_NAME} is a workplace tool and is not meant for anyone under 18.</p>

      <h2>10. Changes</h2>
      <p>
        We will update this page when the service changes, and tell company owners by email about important changes.
        New features that record more (for example screenshots) are always shown to workers in the app before they start.
      </p>

      <h2>11. Contact</h2>
      <p>Questions or requests: {mail}.</p>
    </article>
  );
}
