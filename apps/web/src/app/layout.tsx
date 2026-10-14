import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME } from "@/lib/config";

// Self-hosted (no request to Google at build or page load). Both are variable fonts, OFL licensed.
const inter = localFont({ src: "./fonts/inter.woff2", weight: "100 900", display: "swap", variable: "--font-inter" });
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Time tracking, activity, tasks, leave and payroll for remote teams.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0c22" },
  ],
};

// Runs before the first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
