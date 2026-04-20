import { PublicCard, PublicPageShell } from "../components/public-shell";

export const metadata = {
  title: "About",
  description: "Learn what Vanta is and why it exists.",
};

export default function AboutPage() {
  return (
    <PublicPageShell
      eyebrow="About Vanta"
      title="A calmer workspace for focused AI work."
      description="Vanta is built around a simple idea: AI tools should help you think, ask, review, and create without filling the screen with unnecessary controls."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <PublicCard title="What Vanta does">
          <p>
            Vanta lets people chat with AI, paste screenshots, attach files,
            organize conversations in the browser, and keep a cleaner workspace
            for everyday questions and project work.
          </p>
          <p>
            The product is intentionally minimal. The main focus is the
            conversation, not dashboards, noisy panels, or controls that compete
            with the task.
          </p>
        </PublicCard>

        <PublicCard title="Why it is different">
          <p>
            Vanta favors readable responses, local-first history, and clear
            controls for privacy, web context, files, and instructions.
          </p>
          <p>
            It is still growing, but the goal is steady: make AI feel useful,
            calm, and predictable for real work.
          </p>
        </PublicCard>
      </div>
    </PublicPageShell>
  );
}
