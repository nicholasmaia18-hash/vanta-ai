import { PublicCard, PublicPageShell } from "../components/public-shell";

export const metadata = {
  title: "Guides",
  description: "Practical guides for using Vanta.",
};

const guides = [
  {
    title: "How to use Vanta with screenshots",
    body:
      "Attach an image or paste a screenshot, then ask a focused question about what you want Vanta to inspect, explain, summarize, or rewrite.",
  },
  {
    title: "How to keep conversations organized",
    body:
      "Use short conversation titles, pin useful chats, and start a new conversation when the task changes so the AI has cleaner context.",
  },
  {
    title: "When to use web context",
    body:
      "Turn on web context only when you need current information, sources, or outside research. Leave it off for faster everyday help.",
  },
];

export default function GuidesPage() {
  return (
    <PublicPageShell
      eyebrow="Guides"
      title="Simple ways to get better results from Vanta."
      description="These quick guides give visitors useful public content and help new users understand how to use the product well."
    >
      <div className="grid gap-4">
        {guides.map((guide) => (
          <PublicCard key={guide.title} title={guide.title}>
            <p>{guide.body}</p>
          </PublicCard>
        ))}
      </div>
    </PublicPageShell>
  );
}
