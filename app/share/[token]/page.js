import Link from "next/link";
import { MessageBody } from "@/app/components/message-body";
import {
  getSupabaseAdminClient,
  mapConversationRecord,
} from "@/app/lib/supabase";

export async function generateMetadata({ params }) {
  const { token } = await params;

  return {
    title: `Shared conversation - ${token.slice(0, 8)}`,
    description: "A shared Vanta conversation.",
  };
}

async function getSharedConversation(token) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("vanta_conversations")
    .select("*")
    .eq("public_token", token)
    .eq("is_public", true)
    .maybeSingle();

  return data ? mapConversationRecord(data) : null;
}

export default async function SharedConversationPage({ params }) {
  const { token } = await params;
  const conversation = await getSharedConversation(token);

  return (
    <main className="min-h-screen bg-[#05010b] text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[1.8rem] border border-white/8 bg-[#090410]/88 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-violet-200/70">
                Vanta
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">
                {conversation?.title || "Shared conversation"}
              </h1>
              <p className="mt-2 text-sm text-white/50">
                Read-only workspace view
              </p>
            </div>
            <Link
              href="/"
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              Open Vanta
            </Link>
          </div>

          {!conversation ? (
            <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm text-white/60">
              This shared conversation is unavailable right now.
            </div>
          ) : (
            <div className="space-y-4">
              {conversation.messages.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`max-w-[90%] rounded-[1.2rem] px-4 py-3 sm:px-5 sm:py-4 ${
                    message.role === "user"
                      ? "ml-auto bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-500 text-white shadow-[0_10px_28px_rgba(168,85,247,0.22)]"
                      : "border border-white/6 bg-white/[0.04] text-white"
                  }`}
                >
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                    {message.role === "user" ? "You" : "Vanta"}
                  </p>
                  <MessageBody
                    content={message.content}
                    user={message.role === "user"}
                    attachments={message.attachments}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
