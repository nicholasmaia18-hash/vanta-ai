import Link from "next/link";

const proPaymentLink = process.env.NEXT_PUBLIC_VANTA_PRO_PAYMENT_LINK || "";
const supportLink = process.env.NEXT_PUBLIC_VANTA_SUPPORT_LINK || "";

const pricingFeatures = [
  "More room for long conversations",
  "Priority image and screenshot workflows",
  "Better saved workspace organization",
  "Early access to new Vanta tools",
];

const freeFeatures = [
  "Browser-saved conversations",
  "Basic chat and file uploads",
  "Screen assistant access",
  "Limited free-plan request pace",
];

export const metadata = {
  title: "Pricing",
  description: "Upgrade Vanta for more room, stronger workflows, and early access.",
};

export default function PricingPage() {
  const hasProLink = Boolean(proPaymentLink);
  const hasSupportLink = Boolean(supportLink);

  return (
    <main className="min-h-screen bg-[#0b0b0f] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <nav className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-sm text-white/66 transition hover:text-white"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/16 bg-violet-500/10 text-sm font-semibold text-violet-100">
              V
            </span>
            Back to Vanta
          </Link>
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-white/48">
            Founding pricing
          </span>
        </nav>

        <section className="rounded-[1.6rem] border border-white/8 bg-[#111217] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-violet-100/48">
            Vanta Pro
          </p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                Upgrade the workspace when Vanta starts saving you time.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/52">
                Keep the free version simple. Add Pro when you want more message
                room, smoother screenshot workflows, and early access to the
                features that turn Vanta into a daily tool.
              </p>
            </div>

            <div className="rounded-[1.25rem] border border-violet-300/14 bg-violet-500/[0.055] p-5">
              <p className="text-sm text-white/52">Suggested starting price</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em]">
                  $5
                </span>
                <span className="pb-2 text-sm text-white/42">per month</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/48">
                You can change this later in Stripe. The page is ready now; it
                only needs your Stripe Payment Link in Vercel.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <PlanCard
            eyebrow="Current"
            title="Free"
            price="$0"
            description="Good for testing, learning, and light use."
            features={freeFeatures}
            ctaHref="/"
            ctaLabel="Keep using Free"
            subdued
          />
          <PlanCard
            eyebrow="Best next step"
            title="Pro"
            price="$5"
            description="For people who want more room and stronger workflows."
            features={pricingFeatures}
            ctaHref={hasProLink ? proPaymentLink : ""}
            ctaLabel={hasProLink ? "Upgrade to Pro" : "Stripe link not set yet"}
            note={
              hasProLink
                ? "Secure checkout opens with Stripe."
                : "Add NEXT_PUBLIC_VANTA_PRO_PAYMENT_LINK in Vercel to activate this button."
            }
            highlighted
          />
        </section>

        <section className="rounded-[1.35rem] border border-white/8 bg-[#111217] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/34">
                Not ready for Pro?
              </p>
              <p className="mt-2 text-sm leading-6 text-white/54">
                A support link is an easy first monetization option while you
                keep improving the product.
              </p>
            </div>
            {hasSupportLink ? (
              <a
                href={supportLink}
                className="rounded-[1rem] border border-white/10 bg-white/[0.06] px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-white/[0.1]"
              >
                Support Vanta
              </a>
            ) : (
              <span className="rounded-[1rem] border border-white/8 px-5 py-3 text-center text-sm text-white/34">
                Support link not set
              </span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PlanCard({
  eyebrow,
  title,
  price,
  description,
  features,
  ctaHref,
  ctaLabel,
  note,
  highlighted,
  subdued,
}) {
  const isDisabled = !ctaHref;

  return (
    <article
      className={`rounded-[1.35rem] border p-5 sm:p-6 ${
        highlighted
          ? "border-violet-300/22 bg-gradient-to-br from-violet-500/[0.13] to-fuchsia-500/[0.08] shadow-[0_24px_80px_rgba(76,29,149,0.18)]"
          : "border-white/8 bg-[#111217]"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/34">
        {eyebrow}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/48">{description}</p>
        </div>
        <p className="text-3xl font-semibold tracking-[-0.05em]">{price}</p>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-white/66">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isDisabled ? (
        <button
          disabled
          className="mt-7 w-full cursor-not-allowed rounded-[1rem] border border-white/8 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/34"
        >
          {ctaLabel}
        </button>
      ) : (
        <Link
          href={ctaHref}
          className={`mt-7 block w-full rounded-[1rem] px-5 py-3 text-center text-sm font-medium transition ${
            subdued
              ? "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
              : "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_12px_32px_rgba(76,29,149,0.24)] hover:brightness-110"
          }`}
        >
          {ctaLabel}
        </Link>
      )}

      {note && <p className="mt-3 text-xs leading-5 text-white/38">{note}</p>}
    </article>
  );
}
