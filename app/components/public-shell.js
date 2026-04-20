import Link from "next/link";

const publicLinks = [
  { href: "/about", label: "About" },
  { href: "/guides", label: "Guides" },
  { href: "/arcade", label: "Arcade" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

export function PublicNav() {
  return (
    <nav className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/"
        className="inline-flex items-center gap-3 text-sm text-white/66 transition hover:text-white"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/16 bg-violet-500/10 text-sm font-semibold text-violet-100">
          V
        </span>
        <span>Vanta</span>
      </Link>
      <div className="flex flex-wrap gap-2">
        {publicLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-xs text-white/48 transition hover:border-violet-300/20 hover:text-white/78"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="rounded-[1.15rem] border border-white/8 bg-[#111217] p-5 text-sm text-white/44">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p>
          Vanta is a focused AI workspace for chat, screenshots, files, and
          browser-saved conversations.
        </p>
        <div className="flex flex-wrap gap-2">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white/78"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

export function PublicPageShell({ eyebrow, title, description, children }) {
  return (
    <main className="min-h-screen bg-[#0b0b0f] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <PublicNav />
        <section className="rounded-[1.6rem] border border-white/8 bg-[#111217] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-violet-100/48">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-3xl text-base leading-8 text-white/54">
              {description}
            </p>
          ) : null}
        </section>
        {children}
        <PublicFooter />
      </div>
    </main>
  );
}

export function PublicCard({ title, children }) {
  return (
    <section className="rounded-[1.25rem] border border-white/8 bg-[#111217] p-5 sm:p-6">
      {title ? (
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">
          {title}
        </h2>
      ) : null}
      <div className={`${title ? "mt-4" : ""} space-y-4 text-sm leading-7 text-white/58`}>
        {children}
      </div>
    </section>
  );
}
