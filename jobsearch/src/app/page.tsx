import JobTable from "./components/JobTable";

export default async function Home() {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-[1440px] mx-auto">
      <main className="flex-grow">
        <JobTable />
      </main>
    </div>
  );
}
