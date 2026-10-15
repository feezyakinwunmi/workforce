/** Staff records: types and labels (see migration 0026). */

export type StaffProfile = {
  user_id: string;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  start_date: string | null;
  employment_type: EmploymentType | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  pension_pfa: string | null;
  pension_pin: string | null;
  tax_id: string | null;
  emergency_name: string | null;
  emergency_relationship: string | null;
  emergency_phone: string | null;
  updated_at: string;
};

export const PROFILE_COLUMNS =
  "user_id, phone, address, date_of_birth, start_date, employment_type, bank_name, account_number, account_name, pension_pfa, pension_pin, tax_id, emergency_name, emergency_relationship, emergency_phone, updated_at";

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export const EMPLOYMENT: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

export type DocKind = "contract" | "id" | "certificate" | "other";
export const DOC_KIND: Record<DocKind, string> = {
  contract: "Contract",
  id: "ID document",
  certificate: "Certificate",
  other: "Other",
};

export type StaffDocument = {
  id: string;
  user_id: string;
  kind: DocKind;
  title: string;
  file: { path: string; name: string; size: number; type: string };
  expires_on: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type OnboardingTask = { id: string; user_id: string; title: string; position: number; done_at: string | null; done_by: string | null };

export const DOCS_BUCKET = "staff-documents";
export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx";
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

/** "•••• 6789" */
export const maskAccount = (n: string | null) => (n ? `•••• ${n.slice(-4)}` : null);

/** What's filled in, for the records list. */
export function completeness(p: StaffProfile | undefined, docs: StaffDocument[]) {
  return {
    contract: docs.some((d) => d.kind === "contract"),
    id: docs.some((d) => d.kind === "id"),
    bank: Boolean(p?.bank_name && p?.account_number),
    pension: Boolean(p?.pension_pfa && p?.pension_pin),
    emergency: Boolean(p?.emergency_name && p?.emergency_phone),
  };
}

// Suggestions only (free text is allowed).
export const NIGERIAN_BANKS = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank", "FCMB", "Globus Bank", "GTBank", "Jaiz Bank",
  "Keystone Bank", "Kuda", "Lotus Bank", "Moniepoint", "OPay", "Optimus Bank", "PalmPay", "Parallex Bank", "Polaris Bank",
  "PremiumTrust Bank", "Providus Bank", "Signature Bank", "Stanbic IBTC", "Standard Chartered", "Sterling Bank",
  "SunTrust Bank", "Taj Bank", "Titan Trust Bank", "UBA", "Union Bank", "Unity Bank", "VFD Microfinance Bank",
  "Wema Bank", "Zenith Bank",
];

export const NIGERIAN_PFAS = [
  "Access ARM Pensions", "CardinalStone Pensions", "Crusader Sterling Pensions", "FCMB Pensions", "Fidelity Pension Managers",
  "Guaranty Trust Pension Managers", "Leadway Pensure", "NLPC Pension Fund Administrators", "Norrenberger Pensions",
  "NPF Pensions", "OAK Pensions", "Pensions Alliance (PAL)", "Premium Pension", "Radix Pension Managers",
  "Stanbic IBTC Pension Managers", "Tangerine APT Pensions", "Trustfund Pensions", "Veritas Glanvills Pensions",
];
