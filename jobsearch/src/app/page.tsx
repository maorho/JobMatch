import JobTable from "./components/JobTable";

export default async function Home() {
  return (
    <div className="flex flex-col min-h-screen max-w-[1440px]">
      <main className="flex-grow">
        <JobTable />
      </main>
    </div>
  );
}
