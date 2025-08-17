import { Navbar } from "@/components/navbar";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col h-dvh" style={{ paddingBottom: "var(--bottom-nav-height, 96px)" }}>
      <Navbar />
      <main className="mx-auto w-full px-3 flex-grow pt-2 pb-0 flex flex-col min-h-0">
        {children}
      </main>
    </div>
  );
}
