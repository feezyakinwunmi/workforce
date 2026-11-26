/**
 * Refuses email addresses that can never receive our sign-up code, so bots, security scanners
 * and throwaway inboxes don't leave half-made accounts behind (Femi, 26 Nov 2026: Blockaid's
 * scanner signed up three times with "@blockaid-scan.invalid" addresses).
 *
 * Two kinds are refused:
 *   1. Reserved names that can never have a real mailbox (RFC 2606 / 6761): .invalid, .test,
 *      .example, .localhost, .local, and example.com/net/org.
 *   2. Well-known throwaway inbox services (mailinator, 10minutemail…). The list is short on
 *      purpose: it only needs the big ones; the 7-day clean-up removes anything else that
 *      never confirms.
 *
 * Returns a message to show, or null when the address is fine.
 */

const RESERVED_TLDS = ["invalid", "test", "example", "localhost", "local"];
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"];

const DISPOSABLE = [
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "tempmailo.com", "tempmail.dev", "throwawaymail.com", "yopmail.com", "yopmail.net",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com",
  "trashmail.com", "trashmail.de", "fakeinbox.com", "mintemail.com", "mohmal.com",
  "emailondeck.com", "spamgourmet.com", "mailcatch.com", "moakt.com", "tmail.ws",
  "burnermail.io", "inboxkitten.com", "1secmail.com", "1secmail.net", "1secmail.org",
  "mail.tm", "mail.gw", "dropmail.me", "emailfake.com", "fakemail.net",
];

export function emailProblem(email: string): string | null {
  const domain = email.toLowerCase().split("@")[1]?.trim() ?? "";
  if (!domain) return "Enter a valid email address.";
  const tld = domain.split(".").pop() ?? "";

  if (RESERVED_TLDS.includes(tld) || RESERVED_DOMAINS.includes(domain)) {
    return "That email address can't receive mail. Use your real email.";
  }
  // Match the domain itself or any subdomain of a throwaway service.
  if (DISPOSABLE.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "Throwaway email addresses aren't accepted. Use your work or personal email.";
  }
  return null;
}
