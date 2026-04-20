import { PublicCard, PublicPageShell } from "../components/public-shell";

export const metadata = {
  title: "Terms",
  description: "Basic terms for using Vanta.",
};

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Terms"
      title="Use Vanta responsibly."
      description="These basic terms explain the expectations for using Vanta. They are intentionally plain-language while the product is still growing."
    >
      <PublicCard title="Use of the service">
        <p>
          Vanta is provided as an AI workspace for general productivity,
          learning, drafting, review, and creative support. You are responsible
          for how you use the output.
        </p>
        <p>
          Do not use Vanta to break laws, harm others, bypass security systems,
          generate abuse, or submit content you do not have permission to use.
        </p>
      </PublicCard>

      <PublicCard title="AI output">
        <p>
          AI responses may be incomplete, outdated, or incorrect. You should
          review important answers before relying on them, especially for legal,
          medical, financial, academic, or safety-related decisions.
        </p>
      </PublicCard>

      <PublicCard title="Accounts, payments, and availability">
        <p>
          Paid features, if offered, may change over time. Vanta may update,
          limit, pause, or discontinue features as the product improves.
        </p>
        <p>
          Vanta is provided without a guarantee that every feature will always
          be available, error-free, or compatible with every device.
        </p>
      </PublicCard>

      <PublicCard title="Changes">
        <p>
          These terms may be updated as Vanta changes. Continued use of the site
          means you accept the current version of the terms.
        </p>
      </PublicCard>
    </PublicPageShell>
  );
}
