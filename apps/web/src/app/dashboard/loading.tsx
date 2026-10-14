/** Shown instantly while a dashboard page loads its data. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6 motion-reduce:animate-none" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-slate-200" />
        <div className="h-4 w-40 rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 bg-surface p-5">
            <div className="h-3.5 w-24 rounded bg-slate-100" />
            <div className="h-7 w-20 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="card h-64" />
      <div className="card h-48" />
    </div>
  );
}
