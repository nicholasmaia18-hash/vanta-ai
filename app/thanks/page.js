import Link from "next/link";

export const metadata = {
  title: "Thanks",
  description: "Thanks for supporting Vanta.",
};

export default function ThanksPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-5 py-10 text-white">
      <section className="w-full max-w-2xl rounded-[1.6rem] border border-white/8 bg-[#111217] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-violet-100/48">
          Vanta Pro
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
          Thanks for supporting Vanta.
        </h1>
        <p className="mt-5 text-base leading-8 text-white/54">
          Your support helps keep the workspace improving. If you just checked
          out through Stripe, give the site a moment to refresh and then head
          back to the app.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-[1rem] bg-gradient-to-br from-violet-600 to-fuchsia-600 px-5 py-3 text-center text-sm font-medium text-white shadow-[0_12px_32px_rgba(76,29,149,0.24)] transition hover:brightness-110"
          >
            Open Vanta
          </Link>
          <Link
            href="/pricing"
            className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-sm font-medium text-white/70 transition hover:bg-white/[0.08]"
          >
            Back to pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
