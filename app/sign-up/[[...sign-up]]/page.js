import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#05010b] px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/8 bg-[#090410]/88 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)] lg:grid lg:grid-cols-[1.1fr_460px] lg:gap-10 lg:p-8">
        <section className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-[0.95rem] border border-violet-400/15 bg-violet-500/8 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.35em] text-violet-200">
            Vanta
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Create an account for synced conversations.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-white/55 sm:text-[15px]">
            Save conversations, share public threads, and pick up the same workspace from another device without losing context.
          </p>
        </section>
        <section className="mt-8 lg:mt-0">
          <div className="rounded-[1.4rem] border border-white/8 bg-[#12091d] p-4">
            <SignUp />
          </div>
        </section>
      </div>
    </main>
  );
}
