import { PublicCard, PublicPageShell } from "../components/public-shell";

export const metadata = {
  title: "Privacy Policy",
  description: "How Vanta handles browser-saved conversations, files, and AI requests.",
};

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Privacy Policy"
      title="Privacy should be understandable."
      description="This page explains what Vanta stores, what stays in your browser, and what may be sent to services that power the app."
    >
      <PublicCard title="Information you provide">
        <p>
          Vanta may process the messages, prompts, screenshots, images, and
          files you choose to submit in order to generate a response.
        </p>
        <p>
          Do not submit sensitive personal information, passwords, financial
          information, private medical details, or anything you do not want
          processed by an AI service.
        </p>
      </PublicCard>

      <PublicCard title="Browser-saved history">
        <p>
          Vanta is designed to save conversations locally in your browser unless
          you use features such as sharing, exporting, or any future account-sync
          feature.
        </p>
        <p>
          Local browser data can be cleared by your browser settings, device
          cleanup tools, or private/incognito browsing modes.
        </p>
      </PublicCard>

      <PublicCard title="Third-party services">
        <p>
          Vanta may use third-party providers for AI responses, hosting,
          analytics, ads, payments, authentication, and storage. These providers
          may process limited information needed to run those features.
        </p>
        <p>
          If ads are enabled, advertising providers may use cookies or similar
          technologies to measure and serve ads on public pages.
        </p>
      </PublicCard>

      <PublicCard title="Contact">
        <p>
          Questions about privacy can be sent through the contact page. This
          policy may be updated as Vanta adds new features.
        </p>
      </PublicCard>
    </PublicPageShell>
  );
}
