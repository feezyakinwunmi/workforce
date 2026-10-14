export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type LeaveType = {
  id: string;
  name: string;
  color: string;
  days_per_year: number | null;
  paid: boolean;
  archived_at: string | null;
};

export type Balance = {
  leave_type_id: string;
  name: string;
  color: string;
  paid: boolean;
  allowance: number | null;
  used: number;
  pending: number;
};

export const LEAVE_COLUMNS =
  "id, user_id, leave_type_id, start_date, end_date, days, reason, status, decided_by, decided_at, decision_note, created_at";

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

export const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

/** Same rule as private.leave_days in the database: weekdays that aren't holidays. */
export function countLeaveDays(start: string, end: string, holidays: Set<string>) {
  if (!start || !end || end < start) return 0;
  let n = 0;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (let i = 0; d <= last && i < 400; i++) {
    const day = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(day)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/**
 * Nigerian public holidays. Islamic holidays depend on the moon and are declared
 * by the Federal Government shortly before: these dates are estimates to check.
 */
export const NIGERIA_HOLIDAYS: Record<number, Array<{ day: string; name: string }>> = {
  2026: [
    { day: "2026-01-01", name: "New Year's Day" },
    { day: "2026-03-20", name: "Eid al-Fitr (estimated)" },
    { day: "2026-04-03", name: "Good Friday" },
    { day: "2026-04-06", name: "Easter Monday" },
    { day: "2026-05-01", name: "Workers' Day" },
    { day: "2026-05-27", name: "Eid al-Adha (estimated)" },
    { day: "2026-06-12", name: "Democracy Day" },
    { day: "2026-08-26", name: "Eid-el-Maulud (estimated)" },
    { day: "2026-10-01", name: "Independence Day" },
    { day: "2026-12-25", name: "Christmas Day" },
    { day: "2026-12-28", name: "Boxing Day (observed)" },
  ],
  2027: [
    { day: "2027-01-01", name: "New Year's Day" },
    { day: "2027-03-10", name: "Eid al-Fitr (estimated)" },
    { day: "2027-03-26", name: "Good Friday" },
    { day: "2027-03-29", name: "Easter Monday" },
    { day: "2027-05-03", name: "Workers' Day (observed)" },
    { day: "2027-05-17", name: "Eid al-Adha (estimated)" },
    { day: "2027-06-14", name: "Democracy Day (observed)" },
    { day: "2027-08-16", name: "Eid-el-Maulud (estimated)" },
    { day: "2027-10-01", name: "Independence Day" },
    { day: "2027-12-27", name: "Christmas Day (observed)" },
    { day: "2027-12-28", name: "Boxing Day (observed)" },
  ],
};
