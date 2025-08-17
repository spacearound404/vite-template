import { title, subtitle } from "@/components/primitives";
import DefaultLayout from "@/layouts/default";

export default function DocsPage() {
  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div className="inline-block max-w-lg text-center justify-center">
          <h1 className={title()}>About</h1>
          <div className={subtitle({ class: "mt-4" })}>
            Open this app inside Telegram to auto sign-in via WebApp.
          </div>
        </div>
      </section>
    </DefaultLayout>
  );
}
