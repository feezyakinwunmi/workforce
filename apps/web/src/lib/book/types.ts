export type BookLocation = "meet" | "in_person" | "phone";

export const LOCATION_LABEL: Record<BookLocation, string> = {
  meet: "Video call (Workbase Meet)",
  in_person: "In person",
  phone: "Phone call",
};
export const LOCATION_SHORT: Record<BookLocation, string> = { meet: "Video call", in_person: "In person", phone: "Phone call" };

export type PublicService = {
  id: string;
  title: string;
  description: string;
  duration_min: number;
  price_kobo: number;
  pay_now_kobo: number;
  location: BookLocation;
  max_days: number;
};

export type PublicPage = {
  handle: string;
  name: string;
  about: string;
  timezone: string;
  color: string;
  pro: boolean;
  payments: boolean;
  services: PublicService[];
};

export type BookingView = {
  id: string;
  status: BookingStatus;
  service_title: string;
  location: BookLocation;
  location_detail: string;
  duration_min: number;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_email: string;
  price_kobo: number;
  pay_now_kobo: number;
  paid: boolean;
  reference: string | null;
  hold_until: string | null;
  meet_code: string | null;
  cancelled_by: "customer" | "host" | "system" | null;
  cancel_reason: string;
  page: { handle: string; name: string; timezone: string; color: string; pro: boolean };
  can_cancel: boolean;
};

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Waiting for payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "Didn't show up",
};

export type HostPage = {
  id: string;
  handle: string;
  name: string;
  about: string;
  timezone: string;
  color: string;
  active: boolean;
  subaccount_code: string | null;
  bank_name: string | null;
  account_last4: string | null;
  account_name: string | null;
};

export type HostService = {
  id: string;
  title: string;
  description: string;
  duration_min: number;
  price_kobo: number;
  pay_now_kobo: number;
  location: BookLocation;
  location_detail: string;
  buffer_min: number;
  notice_min: number;
  max_days: number;
  daily_limit: number | null;
  active: boolean;
  position: number;
};

export type HostBooking = {
  id: string;
  service_title: string;
  location: BookLocation;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  status: BookingStatus;
  pay_now_kobo: number;
  price_kobo: number;
  paid_at: string | null;
  fee_kobo: number;
  meet_code: string | null;
  cancelled_by: string | null;
  cancel_reason: string;
  created_at: string;
};

export type BookPlan = { tier: "free" | "pro"; price_kobo: number; paid_until: string | null };

export const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const minutes = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/** "Free", "₦20,000", or "₦5,000 deposit · ₦20,000 total". */
export function priceLine(price: number, payNow: number) {
  if (!price) return "Free";
  if (!payNow) return `${naira(price)} · pay later`;
  if (payNow < price) return `${naira(payNow)} deposit · ${naira(price)} total`;
  return naira(price);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** WhatsApp chat link for a Nigerian or international number. */
export function whatsappLink(phone: string, text: string) {
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
