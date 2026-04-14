"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/vanta-db";

const STORAGE_KEYS = {
  cooldownUntil: "vanta_cooldown_until",
};

const MODEL_OPTIONS = [
  { label: "GPT-5.4", value: "openai/gpt-5.4" },
  { label: "GPT-OSS 120B", value: "openai/gpt-oss-120b" },
];

const PROMPT_PRESETS = [
  { label: "Explain", value: "Explain this clearly in simple terms:" },
  { label: "Summarize", value: "Summarize this into the key points:" },
  { label: "Rewrite", value: "Rewrite this to sound more polished:" },
  { label: "Debug", value: "Debug this step by step and point out the likely cause:" },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing.";

const DEFAULT_ASSISTANT_MESSAGE = {
  role: "assistant",
  content:
    "Vanta is online. Ask a question to begin.\n\nI can also format:\n- short lists\n- inline `code`\n- fenced code blocks",
};

function createConversation(model = MODEL_OPTIONS[0].value) {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    model,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [DEFAULT_ASSISTANT_MESSAGE],
  };
}

async function readFileAttachment(file) {
  const isImage = file.type.startsWith("image/");
  const isText =
    file.type.startsWith("text/") ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".json") ||
    file.name.endsWith(".js") ||
    file.name.endsWith(".ts");

  if (!isImage && !isText) {
    throw new Error(`${file.name} is not supported yet. Use text, markdown, json, code, or image files.`);
  }

  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    kind: isImage ? "image" : "text",
    data: content,
  };
}

function buildShareUrl(conversation) {
  const payload = btoa(
    encodeURIComponent(
      JSON.stringify({
        title: conversation.title,
        model: conversation.model,
        systemPrompt: conversation.systemPrompt,
        messages: conversation.messages,
      })
    )
  );

  const url = new URL(window.location.href);
  url.searchParams.set("share", payload);
  return url.toString();
}

function parseSharedConversation() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("share");
  if (!encoded) return null;

  try {
    const data = JSON.parse(decodeURIComponent(atob(encoded)));
    if (!Array.isArray(data.messages) || data.messages.length === 0) return null;

    return {
      id: crypto.randomUUID(),
      title: data.title || "Shared conversation",
      model: data.model || MODEL_OPTIONS[0].value,
      systemPrompt: data.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      messages: data.messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      shared: true,
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [usageTimestamps, setUsageTimestamps] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [historyReady, setHistoryReady] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ||
      null,
    [conversations, activeConversationId]
  );

  const messages = useMemo(
    () => activeConversation?.messages || [DEFAULT_ASSISTANT_MESSAGE],
    [activeConversation]
  );
  const activeModel = activeConversation?.model || MODEL_OPTIONS[0].value;
  const activeSystemPrompt =
    activeConversation?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const sharedConversation = parseSharedConversation();
        const storedState = await loadWorkspaceState();
        const storedCooldown = window.localStorage.getItem(STORAGE_KEYS.cooldownUntil);

        if (cancelled) return;

        if (storedState?.conversations?.length) {
          const nextConversations = sharedConversation
            ? [sharedConversation, ...storedState.conversations]
            : storedState.conversations;
          setConversations(nextConversations);
          setActiveConversationId(
            sharedConversation?.id ||
              storedState.activeConversationId ||
              nextConversations[0].id
          );
          setUsageTimestamps(storedState.usageTimestamps || []);
        } else {
          const freshConversation = sharedConversation || createConversation();
          setConversations([freshConversation]);
          setActiveConversationId(freshConversation.id);
        }

        if (sharedConversation) {
          setBanner({
            tone: "info",
            message: "Shared conversation loaded into your workspace.",
          });
        }

        if (storedCooldown) {
          const remaining = Math.max(
            0,
            Math.ceil((Number(storedCooldown) - Date.now()) / 1000)
          );
          setCooldown(remaining);
        }
      } catch {
        const freshConversation = createConversation();
        setConversations([freshConversation]);
        setActiveConversationId(freshConversation.id);
      } finally {
        if (!cancelled) setHistoryReady(true);
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyReady) return;

    saveWorkspaceState({
      conversations,
      activeConversationId,
      usageTimestamps,
    }).catch(() => {
      setBanner({
        tone: "error",
        message: "Unable to save workspace state in this browser.",
      });
    });
  }, [conversations, activeConversationId, usageTimestamps, historyReady]);

  useEffect(() => {
    if (cooldown <= 0) {
      window.localStorage.removeItem(STORAGE_KEYS.cooldownUntil);
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.cooldownUntil,
      String(Date.now() + cooldown * 1000)
    );

    const timer = setInterval(() => {
      setCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!copiedId) return;
    const timeout = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(timeout);
  }, [copiedId]);

  function updateConversation(conversationId, updater) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              ...updater(conversation),
              updatedAt: Date.now(),
            }
          : conversation
      )
    );
  }

  function createTitleFromMessage(content) {
    const cleaned = content.replace(/\s+/g, " ").trim();
    if (!cleaned) return "New conversation";
    const words = cleaned.split(" ").slice(0, 5).join(" ");
    return words.length < cleaned.length ? `${words}...` : words;
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const attachments = await Promise.all(files.map(readFileAttachment));
      setPendingAttachments((current) => [...current, ...attachments]);
      setBanner({
        tone: "info",
        message: `${attachments.length} file${attachments.length > 1 ? "s" : ""} attached.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: error.message || "File upload failed.",
      });
    } finally {
      event.target.value = "";
    }
  }

  async function sendMessage() {
    if ((!input.trim() && pendingAttachments.length === 0) || loading || cooldown > 0 || !activeConversation) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim() || "Uploaded files",
      attachments: pendingAttachments,
    };

    const streamingMessageId = crypto.randomUUID();
    const assistantPlaceholder = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
    };

    const hasMeaningfulTitle =
      activeConversation.title && activeConversation.title !== "New conversation";

    updateConversation(activeConversation.id, (conversation) => ({
      messages: [...conversation.messages, userMessage, assistantPlaceholder],
      title: hasMeaningfulTitle
        ? conversation.title
        : createTitleFromMessage(userMessage.content),
    }));

    setInput("");
    setPendingAttachments([]);
    setLoading(true);
    setBanner(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMessage],
          model: activeConversation.model,
          systemPrompt: activeConversation.systemPrompt,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json();
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

        updateConversation(activeConversation.id, (conversation) => ({
          messages: [
            ...conversation.messages.filter((message) => message.id !== streamingMessageId),
            { id: crypto.randomUUID(), role: "assistant", content: errorMessage },
          ],
        }));
        setBanner({ tone: "error", message: errorMessage });
        setLoading(false);
        return;
      }

      setUsageTimestamps((current) =>
        [...current, Date.now()].filter((timestamp) => Date.now() - timestamp < 60000)
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;

        updateConversation(activeConversation.id, (conversation) => ({
          messages: conversation.messages.map((message) =>
            message.id === streamingMessageId
              ? { ...message, content: streamedText }
              : message
          ),
        }));
      }

      updateConversation(activeConversation.id, (conversation) => ({
        messages: conversation.messages.map((message) =>
          message.id === streamingMessageId
            ? {
                id: streamingMessageId,
                role: "assistant",
                content: streamedText.trim() || "No response returned.",
              }
            : message
        ),
      }));
    } catch {
      const errorMessage = "Connection error. Please try again.";
      updateConversation(activeConversation.id, (conversation) => ({
        messages: [
          ...conversation.messages.filter((message) => message.id !== streamingMessageId),
          { id: crypto.randomUUID(), role: "assistant", content: errorMessage },
        ],
      }));
      setBanner({ tone: "error", message: errorMessage });
    }

    setLoading(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function createNewConversation() {
    const newConversation = createConversation(activeModel);
    setConversations((current) => [newConversation, ...current]);
    setActiveConversationId(newConversation.id);
    setInput("");
    setPendingAttachments([]);
    setCooldown(0);
  }

  function resetConversation() {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, () => ({
      title: "New conversation",
      messages: [DEFAULT_ASSISTANT_MESSAGE],
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    }));
    setInput("");
    setPendingAttachments([]);
    setCooldown(0);
  }

  function renameConversation(id) {
    const nextTitle = window.prompt("Rename conversation");
    if (!nextTitle?.trim()) return;

    updateConversation(id, () => ({
      title: nextTitle.trim(),
    }));
  }

  function deleteConversation(id) {
    if (!window.confirm("Delete this conversation?")) return;

    setConversations((current) => {
      const remaining = current.filter((conversation) => conversation.id !== id);
      if (remaining.length === 0) {
        const freshConversation = createConversation();
        setActiveConversationId(freshConversation.id);
        return [freshConversation];
      }

      if (id === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }

      return remaining;
    });
  }

  function changeModel(nextModel) {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, () => ({
      model: nextModel,
    }));
  }

  function updateSystemPrompt(nextPrompt) {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, () => ({
      systemPrompt: nextPrompt,
    }));
  }

  async function copyMessage(content, id) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setBanner({ tone: "success", message: "Message copied." });
    } catch {
      setBanner({
        tone: "error",
        message: "Copy failed in this browser. Try selecting the text manually.",
      });
    }
  }

  async function shareConversation() {
    if (!activeConversation) return;

    try {
      const url = buildShareUrl(activeConversation);
      await navigator.clipboard.writeText(url);
      setBanner({ tone: "success", message: "Share link copied." });
    } catch {
      setBanner({
        tone: "error",
        message: "Share link could not be copied. Try again in a fresh tab.",
      });
    }
  }

  function exportConversation() {
    if (!activeConversation) return;

    const lines = activeConversation.messages.map((message) => {
      const speaker = message.role === "user" ? "You" : "Vanta";
      return `${speaker}\n${message.content}\n`;
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeConversation.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "conversation"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setBanner({ tone: "success", message: "Conversation exported." });
  }

  function applyPreset(value) {
    setInput((current) => (current ? `${value}\n\n${current}` : value));
  }

  function removeAttachment(id) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== id)
    );
  }

  const buttonLabel =
    cooldown > 0 ? `Wait ${cooldown}s` : loading ? "Working..." : "Send";
  const usageCount = usageTimestamps.filter((timestamp) => Date.now() - timestamp < 60000)
    .length;
  const analytics = useMemo(() => {
    const totalMessages = conversations.reduce(
      (sum, conversation) => sum + conversation.messages.length,
      0
    );
    const userMessages = conversations.reduce(
      (sum, conversation) =>
        sum +
        conversation.messages.filter((message) => message.role === "user").length,
      0
    );

    return {
      conversationCount: conversations.length,
      totalMessages,
      userMessages,
      averageMessages:
        conversations.length > 0
          ? Math.round(totalMessages / conversations.length)
          : 0,
    };
  }, [conversations]);

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
              <MetaCard
                label="Model"
                value={
                  MODEL_OPTIONS.find((item) => item.value === activeModel)?.label ||
                  "Custom"
                }
              />
              <MetaCard label="Plan" value="Free" />
              <MetaCard
                label="Cooldown"
                value={cooldown > 0 ? `${cooldown}s` : "Ready"}
              />
              <MetaCard label="Usage" value={`${usageCount}/2`} />
            </div>
          </div>
        </header>

        {banner && (
          <div
            className={`mb-4 rounded-[1.4rem] border px-4 py-3 text-sm ${
              banner.tone === "error"
                ? "border-red-400/20 bg-red-500/10 text-red-200"
                : banner.tone === "success"
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : "border-violet-400/20 bg-violet-500/10 text-violet-200"
            }`}
          >
            {banner.message}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                  Conversations
                </p>
                <button
                  onClick={createNewConversation}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/80 transition hover:bg-white/[0.09]"
                >
                  New
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {conversations
                  .slice()
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`rounded-[1.25rem] border px-4 py-3 ${
                        conversation.id === activeConversationId
                          ? "border-violet-400/30 bg-violet-500/10"
                          : "border-white/8 bg-[#090410]/70"
                      }`}
                    >
                      <button
                        onClick={() => setActiveConversationId(conversation.id)}
                        className="w-full text-left"
                      >
                        <p className="truncate text-sm font-medium text-white">
                          {conversation.title}
                        </p>
                        <p className="mt-1 text-xs text-white/40">
                          {MODEL_OPTIONS.find((item) => item.value === conversation.model)?.label ||
                            conversation.model}
                        </p>
                      </button>
                      <div className="mt-3 flex gap-2 text-xs text-white/45">
                        <button onClick={() => renameConversation(conversation.id)}>Rename</button>
                        <button onClick={() => deleteConversation(conversation.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur">
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                Analytics
              </p>
              <div className="mt-4 space-y-3">
                <SidebarCard label="Conversations" value={String(analytics.conversationCount)} />
                <SidebarCard label="Total messages" value={String(analytics.totalMessages)} />
                <SidebarCard label="Your messages" value={String(analytics.userMessages)} />
                <SidebarCard label="Avg / chat" value={String(analytics.averageMessages)} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur">
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                Workspace
              </p>
              <div className="mt-4 space-y-3">
                <SidebarCard label="Input" value="Enter to send" />
                <SidebarCard label="Rate limit" value="2 requests per minute" />
                <SidebarCard label="Storage" value="Local browser database" />
                <SidebarCard label="Sharing" value="Copyable private share links" />
              </div>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                    Conversation
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
                    {activeConversation?.title || "Chat"}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={activeModel}
                    onChange={(event) => changeModel(event.target.value)}
                    className="rounded-full border border-white/10 bg-[#090410] px-3 py-2 text-sm text-white/70 outline-none"
                  >
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={shareConversation}
                    className="rounded-full border border-white/10 bg-[#090410] px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
                  >
                    Share
                  </button>
                  <button
                    onClick={exportConversation}
                    className="rounded-full border border-white/10 bg-[#090410] px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
                  >
                    Export
                  </button>
                  <button
                    onClick={resetConversation}
                    className="rounded-full border border-white/10 bg-[#090410] px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
                  >
                    Reset
                  </button>
                  {cooldown > 0 && (
                    <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                      Wait {cooldown}s
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="flex flex-wrap gap-2">
                  {PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => applyPreset(preset.value)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/65 transition hover:bg-white/[0.08]"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/65 transition hover:bg-white/[0.08]"
                  >
                    Attach files
                  </button>
                </div>

                <div className="rounded-[1.4rem] border border-white/10 bg-[#090410] p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/35">
                    System prompt
                  </p>
                  <textarea
                    value={activeSystemPrompt}
                    onChange={(event) => updateSystemPrompt(event.target.value)}
                    rows={5}
                    className="mt-3 w-full resize-none rounded-[1rem] border border-white/10 bg-transparent px-3 py-3 text-sm leading-6 text-white/78 outline-none placeholder:text-white/25"
                  />
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-3 text-sm text-white/45">
              <span>{usageCount}/2 requests used in the last minute</span>
              <span>Shift+Enter for newline</span>
              <span>Streaming enabled</span>
            </div>

            {pendingAttachments.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-white/70"
                  >
                    <span>{attachment.name}</span>
                    <button onClick={() => removeAttachment(attachment.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="h-[500px] overflow-y-auto rounded-[1.8rem] border border-white/10 bg-[#090410] p-4 sm:h-[580px] sm:p-5">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={message.id || index}
                    className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 sm:px-5 sm:py-4 ${
                      message.role === "user"
                        ? "ml-auto bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_10px_30px_rgba(168,85,247,0.28)]"
                        : "bg-white/[0.055] text-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                        {message.role === "user" ? "You" : "Vanta"}
                      </p>
                      <button
                        onClick={() => copyMessage(message.content, message.id || index)}
                        className="text-xs text-white/40 transition hover:text-white/75"
                      >
                        {copiedId === (message.id || index) ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <MessageBody
                      content={message.content}
                      user={message.role === "user"}
                      attachments={message.attachments}
                    />
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
                disabled={loading || cooldown > 0 || (!input.trim() && pendingAttachments.length === 0)}
                className="rounded-[1.6rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 px-6 py-4 text-base font-medium text-white shadow-[0_12px_36px_rgba(168,85,247,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28 disabled:shadow-none"
              >
                {buttonLabel}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept=".txt,.md,.json,.js,.ts,image/*"
              onChange={handleAttachmentChange}
            />
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

function MessageBody({ content, user, attachments = [] }) {
  const blocks = content.split(/```/);

  return (
    <div className="space-y-3 text-sm leading-7 text-white/88 sm:text-base">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/70"
            >
              {attachment.name}
            </div>
          ))}
        </div>
      )}

      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const lines = block.split("\n");
          const firstLine = lines[0]?.trim();
          const language = firstLine && !firstLine.includes(" ") ? firstLine : "";
          const code = language ? lines.slice(1).join("\n") : block;

          return (
            <div
              key={`${index}-${language}`}
              className={`overflow-hidden rounded-[1.1rem] border ${
                user
                  ? "border-white/20 bg-[#2a1348]/65"
                  : "border-white/10 bg-[#12091d]"
              }`}
            >
              <div className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                {language || "code"}
              </div>
              <pre className="overflow-x-auto px-4 py-3 text-sm leading-6 text-white/90">
                <code>{code.trim()}</code>
              </pre>
            </div>
          );
        }

        return block
          .split("\n")
          .filter((line) => line.trim())
          .map((line, lineIndex) => {
            if (line.trim().startsWith("- ")) {
              return (
                <div key={`${index}-${lineIndex}`} className="flex gap-2">
                  <span className="mt-[10px] h-2 w-2 rounded-full bg-current opacity-70" />
                  <p>{renderInline(line.trim().slice(2))}</p>
                </div>
              );
            }

            return (
              <p key={`${index}-${lineIndex}`} className="whitespace-pre-wrap">
                {renderInline(line)}
              </p>
            );
          });
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.94em] text-white"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
