import Link from "next/link";
import { PublicCard, PublicPageShell } from "../components/public-shell";

export const metadata = {
  title: "Contact",
  description: "Contact Vanta for support, feedback, and questions.",
};

export default function ContactPage() {
  return (
    <PublicPageShell
      eyebrow="Contact"
      title="Questions, feedback, or support."
      description="Vanta is still growing. Use this page as the public contact point for support, privacy questions, product feedback, or partnership requests."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <PublicCard title="General contact">
          <p>
            For now, the best contact method is through the{" "}
            <a
              className="text-violet-200 hover:text-white"
              href="https://github.com/nicholasmaia18-hash/vanta-ai"
            >
              Vanta GitHub repository
            </a>
            .
          </p>
          <p>
            A dedicated support email can be added here later once Vanta has its
            own domain and mailbox.
          </p>
        </PublicCard>

        <PublicCard title="Useful links">
          <p>
            Need to use the app?{" "}
            <Link className="text-violet-200 hover:text-white" href="/">
              Open Vanta
            </Link>
            .
          </p>
          <p>
            Want to support or upgrade?{" "}
            <Link className="text-violet-200 hover:text-white" href="/pricing">
              View pricing
            </Link>
            .
          </p>
        </PublicCard>
      </div>
    </PublicPageShell>
  );
}
