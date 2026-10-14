/**
 * The hero: the product's own "through the day" view, for a small team spread
 * across time zones. Static demo data (no hydration surprises); the bars grow
 * in once on load, unless the visitor prefers reduced motion.
 */
type Row = {
  name: string;
  initials: string;
  city: string;
  local: string;
  status: "Working" | "Idle" | "Not started";
  // Activity per 10 minutes over the last ~3 hours: 0 = not working, otherwise % active.
  blocks: number[];
};

const ROWS: Row[] = [
  {
    name: "Adaeze Okafor",
    initials: "AO",
    city: "Lagos",
    local: "11:40",
    status: "Working",
    blocks: [72, 81, 64, 90, 77, 58, 0, 0, 66, 85, 92, 74, 69, 88, 79, 83, 71, 94],
  },
  {
    name: "Tunde Bakare",
    initials: "TB",
    city: "Accra",
    local: "10:40",
    status: "Idle",
    blocks: [0, 0, 55, 61, 48, 70, 66, 52, 44, 63, 38, 22, 47, 59, 61, 40, 26, 18],
  },
  {
    name: "Chiamaka Eze",
    initials: "CE",
    city: "Nairobi",
    local: "13:40",
    status: "Working",
    blocks: [84, 79, 91, 88, 0, 0, 0, 0, 73, 80, 86, 77, 90, 82, 75, 87, 81, 89],
  },
  {
    name: "Kemi Adeyemi",
    initials: "KA",
    city: "Toronto",
    local: "06:40",
    status: "Not started",
    blocks: Array(18).fill(0),
  },
];

const tone = (pct: number) => (pct >= 60 ? "bg-[#10B981]" : pct >= 30 ? "bg-[#F59E0B]" : "bg-[#F87171]");

const STATUS: Record<Row["status"], string> = {
  Working: "bg-emerald-50 text-emerald-700",
  Idle: "bg-amber-50 text-amber-700",
  "Not started": "bg-[#F1EFF8] text-[#5B5876]",
};

export function HeroTimeline() {
  return (
    <figure className="rounded-2xl border border-[#E6E3F2] bg-white p-4 shadow-[0_24px_60px_-28px_rgba(28,22,64,0.35)] sm:p-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-[#1C1640]">Today, by person</span>
        <span className="text-sm text-[#5B5876]">each bar is 10 minutes, coloured by how active it was</span>
      </figcaption>
      <ul className="space-y-4">
        {ROWS.map((r, rowIndex) => (
          <li key={r.name} className="grid grid-cols-[2.25rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[2.25rem_11rem_1fr] sm:items-center">
            <span className="row-span-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-semibold text-[#4C1D95] sm:row-span-1">
              {r.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1C1640]">{r.name}</p>
              <p className="flex items-center gap-2 text-xs text-[#5B5876]">
                <span>{r.city}, {r.local} there</span>
                <span className={`whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-medium ${STATUS[r.status]}`}>{r.status}</span>
              </p>
            </div>
            <div className="flex h-12 items-end gap-[3px]" aria-hidden>
              {r.blocks.map((pct, i) => (
                <span key={i} className="flex h-full flex-1 items-end rounded-[3px] bg-[#F6F4FC]">
                  {pct > 0 && (
                    <span
                      className={`timeline-bar block w-full rounded-[3px] ${tone(pct)}`}
                      style={{ height: `${Math.max(18, pct)}%`, animationDelay: `${rowIndex * 120 + i * 35}ms` }}
                    />
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only">
        Example: Adaeze in Lagos and Chiamaka in Nairobi are working with high activity, Tunde in Accra is idle, and Kemi in
        Toronto has not started her day.
      </p>
    </figure>
  );
}
