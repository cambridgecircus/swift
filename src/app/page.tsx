import ReportGenerator from "@/components/ReportGenerator";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        ...
        <div className="grid gap-6 md:grid-cols-3">
          ...
        </div>

        <ReportGenerator />
      </section>
    </main>
  );
}
