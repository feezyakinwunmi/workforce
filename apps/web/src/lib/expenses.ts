import type { IconName } from "@/components/icons";

export type ExpenseStatus = "pending" | "approved" | "rejected" | "cancelled" | "paid";
export type Receipt = { path: string; name: string; size: number; type: string };

export type Expense = {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  amount_minor: number;
  currency: "NGN" | "USD";
  spent_on: string;
  note: string | null;
  receipt: Receipt | null;
  status: ExpenseStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  paid_month: string | null;
  payslip_id: string | null;
  created_at: string;
};

export const EXPENSE_COLUMNS =
  "id, user_id, title, category, amount_minor, currency, spent_on, note, receipt, status, decided_by, decided_at, decision_note, paid_month, payslip_id, created_at";

export const CATEGORIES = ["transport", "travel", "meals", "internet", "equipment", "office", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY: Record<Category, { label: string; icon: IconName }> = {
  transport: { label: "Transport", icon: "arrowRight" },
  travel: { label: "Travel", icon: "globe" },
  meals: { label: "Meals", icon: "sparkle" },
  internet: { label: "Data and internet", icon: "zap" },
  equipment: { label: "Equipment", icon: "monitor" },
  office: { label: "Office supplies", icon: "briefcase" },
  other: { label: "Other", icon: "receipt" },
};

export const STATUS: Record<ExpenseStatus, { label: string; style: string }> = {
  pending: { label: "Waiting", style: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", style: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Not approved", style: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", style: "bg-slate-100 text-slate-500" },
  paid: { label: "Paid", style: "bg-brand-100 text-brand-700" },
};

// Receipts: private bucket, path <company>/<person>/<random>/<file name> (migration 0024).
export const RECEIPT_BUCKET = "expense-receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const RECEIPT_ACCEPT = "image/*,application/pdf";
