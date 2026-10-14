/** Skeleton shown while the server loads a job (the page is force-dynamic and reads the DB). */
export default function JobLoading() {
  return (
    <div className="jm-page" aria-busy="true">
      <section className="jm-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="jm-skeleton h-14 w-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="jm-skeleton h-7 w-2/3" />
            <div className="jm-skeleton h-4 w-1/3" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="jm-skeleton h-6 w-24 rounded-full" />
          <div className="jm-skeleton h-6 w-20 rounded-full" />
          <div className="jm-skeleton h-6 w-28 rounded-full" />
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <section className="jm-card p-5 sm:p-6 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`jm-skeleton h-3 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
          ))}
        </section>
        <aside className="jm-card p-5 space-y-3">
          <div className="jm-skeleton h-5 w-1/2" />
          <div className="jm-skeleton h-3 w-full" />
          <div className="jm-skeleton h-3 w-5/6" />
        </aside>
      </div>
    </div>
  );
}
