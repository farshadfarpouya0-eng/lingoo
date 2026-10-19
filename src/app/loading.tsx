export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-slate-200/70" />)}
      </div>
    </div>
  );
}
