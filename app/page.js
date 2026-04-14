"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Vanta is online. Ask a question to begin.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading || cooldown > 0) return;

    const userMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages,
        }),
      });

      const data = await res.json();

      if (data.reply) {
        setMessages([
          ...updatedMessages,
          { role: "assistant", content: data.reply },
        ]);
      } else {
        let errorMessage = data.error || "Request failed.";

        if (data.isRateLimited && data.retryAfter) {
          const seconds = Number(data.retryAfter) || 0;
          setCooldown(seconds);
          errorMessage = `Rate limit reached on the free plan. Wait about ${seconds} seconds, then try one message again.`;
        } else if (data.retryAfter) {
          const seconds = Number(data.retryAfter) || 0;
          setCooldown(seconds);
          errorMessage = `Retry in ${seconds} seconds.`;
        }

        setMessages([
          ...updatedMessages,
          { role: "assistant", content: errorMessage },
        ]);
      }
    } catch {
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Connection error. Please try again.",
        },
      ]);
    }

    setLoading(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function resetConversation() {
    setMessages([
      {
        role: "assistant",
        content: "New conversation started.",
      },
    ]);
    setInput("");
    setCooldown(0);
  }

  const buttonLabel =
    cooldown > 0 ? `Wait ${cooldown}s` : loading ? "Working..." : "Send";

  return (
    <main className="min-h-screen bg-[#05010b] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_16px_#8b5cf6]" />
                <span className="text-[11px] font-medium uppercase tracking-[0.35em] text-violet-200">
                  Vanta
                </span>
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
                AI workspace
                <span className="block text-white/55">without the clutter.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
                A restrained interface for conversation, response review, and cooldown management.
                Built to feel calm, fast, and intentional.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetaCard label="Model" value="GPT-5.4" />
              <MetaCard label="Plan" value="Free" />
              <MetaCard
                label="Cooldown"
                value={cooldown > 0 ? `${cooldown}s` : "Ready"}
              />
              <MetaCard label="Status" value={loading ? "Running" : "Idle"} />
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur">
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
              Overview
            </p>

            <div className="mt-6 space-y-3">
              <SidebarCard label="Input" value="Enter to send" />
              <SidebarCard label="Limit" value="2 requests per minute" />
              <SidebarCard
                label="Availability"
                value={cooldown > 0 ? `${cooldown} seconds remaining` : "Available"}
              />
            </div>

            <div className="mt-8 rounded-[1.6rem] border border-white/8 bg-[#0a0612] p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/32">
                Notes
              </p>
              <p className="mt-3 text-sm leading-7 text-white/56">
                The interface is intentionally narrow in scope: fewer visual decisions, stronger spacing, and a clear primary path through the product.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/42">
                On the free plan, treat the cooldown as roughly one minute after a rate-limit hit.
              </p>
            </div>

            <button
              onClick={resetConversation}
              className="mt-8 w-full rounded-[1.3rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.09]"
            >
              New conversation
            </button>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                  Conversation
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
                  Chat
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-white/10 bg-[#090410] px-3 py-1.5 text-sm text-white/52">
                  Shift+Enter for newline
                </div>
                {cooldown > 0 && (
                  <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-200">
                    Wait {cooldown}s
                  </div>
                )}
              </div>
            </div>

            <div className="h-[500px] overflow-y-auto rounded-[1.8rem] border border-white/10 bg-[#090410] p-4 sm:h-[580px] sm:p-5">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 sm:px-5 sm:py-4 ${
                      message.role === "user"
                        ? "ml-auto bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_10px_30px_rgba(168,85,247,0.28)]"
                        : "bg-white/[0.055] text-white"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                      {message.role === "user" ? "You" : "Vanta"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-white/88 sm:text-base">
                      {message.content}
                    </p>
                  </div>
                ))}

                {loading && (
                  <div className="max-w-[85%] rounded-[1.5rem] bg-white/[0.055] px-5 py-4 text-white">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                      Vanta
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.3s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.15s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_170px]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                placeholder="Type your message..."
                className="min-h-[100px] resize-none rounded-[1.6rem] border border-white/10 bg-[#090410] px-5 py-4 text-white outline-none placeholder:text-white/28 focus:border-violet-400/30"
              />
              <button
                onClick={sendMessage}
                disabled={loading || cooldown > 0 || !input.trim()}
                className="rounded-[1.6rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 px-6 py-4 text-base font-medium text-white shadow-[0_12px_36px_rgba(168,85,247,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28 disabled:shadow-none"
              >
                {buttonLabel}
              </button>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MetaCard({ label, value }) {
  return (
    <div className="rounded-[1.3rem] border border-white/10 bg-[#090410]/80 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/30">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function SidebarCard({ label, value }) {
  return (
    <div className="rounded-[1.3rem] border border-white/10 bg-[#090410]/80 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/30">
        {label}
      </p>
      <p className="mt-2 text-sm text-white/84">{value}</p>
    </div>
  );
}
