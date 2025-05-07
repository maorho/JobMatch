import JobTable from "./components/JobTable";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        <JobTable />
      </main>
    </div>
  );
}
