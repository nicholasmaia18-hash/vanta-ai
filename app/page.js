"use client";

import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBody } from "./components/message-body";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/vanta-db";
import { getSyncReadiness } from "./lib/sync-config";
import { mergeConversations, sortConversations } from "./lib/supabase";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const STORAGE_KEYS = { cooldownUntil: "vanta_cooldown_until" };
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
  id: "default-assistant",
  role: "assistant",
  content:
    "Vanta is online. Ask a question to begin.\n\nI can also help with:\n- research mode with web context\n- pasted screenshots and images\n- files, code, and quick exports",
};

function createConversation(model = MODEL_OPTIONS[0].value) {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    model,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    researchMode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [DEFAULT_ASSISTANT_MESSAGE],
  };
}

function normalizeConversation(conversation) {
  return {
    ...conversation,
    researchMode: Boolean(conversation.researchMode),
    systemPrompt: conversation.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    messages:
      Array.isArray(conversation.messages) && conversation.messages.length > 0
        ? conversation.messages
        : [DEFAULT_ASSISTANT_MESSAGE],
    createdAt: conversation.createdAt || Date.now(),
    updatedAt: conversation.updatedAt || Date.now(),
  };
}

function createTitleFromMessage(content) {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  const words = cleaned.split(" ").slice(0, 5).join(" ");
  return words.length < cleaned.length ? `${words}...` : words;
}

function hasImageAttachments(conversation) {
  return conversation.messages.some((message) =>
    (message.attachments || []).some((attachment) => attachment.kind === "image")
  );
}

async function readFileAttachment(file) {
  const isImage = file.type.startsWith("image/");
  const isText =
    file.type.startsWith("text/") ||
    [".md", ".txt", ".json", ".js", ".ts", ".jsx", ".tsx"].some((ext) =>
      file.name.endsWith(ext)
    );

  if (!isImage && !isText) {
    throw new Error(
      `${file.name} is not supported yet. Use screenshots, images, text, markdown, json, or code files.`
    );
  }

  const data = await new Promise((resolve, reject) => {
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
    data,
  };
}

function buildShareUrl(conversation) {
  const payload = btoa(
    encodeURIComponent(
      JSON.stringify({
        title: conversation.title,
        model: conversation.model,
        researchMode: conversation.researchMode,
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
  const encoded = new URLSearchParams(window.location.search).get("share");
  if (!encoded) return null;

  try {
    const data = JSON.parse(decodeURIComponent(atob(encoded)));
    if (!Array.isArray(data.messages) || data.messages.length === 0) return null;
    return normalizeConversation({
      id: crypto.randomUUID(),
      title: data.title || "Shared conversation",
      model: data.model || MODEL_OPTIONS[0].value,
      researchMode: Boolean(data.researchMode),
      systemPrompt: data.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      messages: data.messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      shared: true,
    });
  } catch {
    return null;
  }
}

function formatSyncStatus(syncStatus) {
  return syncStatus || "Local only";
}

export default function Home() {
  const syncReadiness = getSyncReadiness();
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
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    syncReadiness.ready ? "Checking sync" : "Local only"
  );
  const [pendingDeleteConversationId, setPendingDeleteConversationId] =
    useState(null);
  const [pendingRenameConversationId, setPendingRenameConversationId] =
    useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceBaseInputRef = useRef("");

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
  const hasCustomPrompt =
    activeSystemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT.trim();
  const researchMode = Boolean(activeConversation?.researchMode);
  const usageCount = usageTimestamps.filter(
    (timestamp) => Date.now() - timestamp < 60000
  ).length;

  const filteredConversations = useMemo(() => {
    if (!conversationSearch.trim()) return sortConversations(conversations);
    const query = conversationSearch.toLowerCase().trim();
    return sortConversations(conversations).filter((conversation) =>
      [conversation.title, ...conversation.messages.map((message) => message.content)]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [conversationSearch, conversations]);

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

  function updateConversation(conversationId, updater) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? normalizeConversation({
              ...conversation,
              ...updater(conversation),
              updatedAt: Date.now(),
            })
          : conversation
      )
    );
  }

  async function queueAttachments(files) {
    if (!files.length) return;
    try {
      const attachments = await Promise.all(files.map(readFileAttachment));
      setPendingAttachments((current) => [...current, ...attachments]);
      setBanner({
        tone: "info",
        message: `${attachments.length} attachment${attachments.length > 1 ? "s" : ""} ready. Paste screenshots or drag images in anytime.`,
      });
    } catch (error) {
      setBanner({ tone: "error", message: error.message || "File upload failed." });
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const sharedConversation = parseSharedConversation();
      const storedCooldown = window.localStorage.getItem(STORAGE_KEYS.cooldownUntil);

      try {
        const storedState = await loadWorkspaceState();
        if (cancelled) return;

        const localConversations =
          storedState?.conversations?.length > 0
            ? storedState.conversations.map(normalizeConversation)
            : [sharedConversation || createConversation()];

        const nextLocalConversations = sharedConversation
          ? [sharedConversation, ...localConversations]
          : localConversations;

        const uniqueLocal = sortConversations(
          Array.from(
            new Map(
              nextLocalConversations.map((conversation) => [conversation.id, conversation])
            ).values()
          )
        );

        setConversations(uniqueLocal);
        setActiveConversationId(
          sharedConversation?.id ||
            storedState?.activeConversationId ||
            uniqueLocal[0]?.id ||
            null
        );
        setUsageTimestamps(storedState?.usageTimestamps || []);

        if (storedCooldown) {
          const remaining = Math.max(
            0,
            Math.ceil((Number(storedCooldown) - Date.now()) / 1000)
          );
          setCooldown(remaining);
        }

        if (sharedConversation) {
          setBanner({
            tone: "info",
            message: "Shared conversation loaded into your workspace.",
          });
        } else if (!syncReadiness.ready) {
          setBanner({
            tone: "info",
            message:
              "Local mode is active. Cloud sync will unlock once Clerk and Supabase are configured.",
          });
        }

        if (syncReadiness.ready) {
          setSyncStatus("Checking sync");

          try {
            const response = await fetch("/api/workspace", { cache: "no-store" });
            if (cancelled) return;

            if (response.status === 401) {
              setSyncStatus("Sign in to sync");
            } else if (response.ok) {
              const data = await response.json();
              const remoteConversations = Array.isArray(data.conversations)
                ? data.conversations.map(normalizeConversation)
                : [];
              const merged = mergeConversations(uniqueLocal, remoteConversations);
              const mergedConversations = merged.length > 0 ? merged : uniqueLocal;

              setConversations(mergedConversations);
              setActiveConversationId(
                data.activeConversationId ||
                  mergedConversations[0]?.id ||
                  uniqueLocal[0]?.id ||
                  null
              );
              setUsageTimestamps(
                Array.isArray(data.usageTimestamps)
                  ? data.usageTimestamps
                  : storedState?.usageTimestamps || []
              );
              setSyncStatus(
                remoteConversations.length > 0 ? "Synced" : "Signed in - cloud ready"
              );
            } else {
              setSyncStatus("Cloud setup pending");
            }
          } catch {
            setSyncStatus("Cloud sync unavailable");
          }
        }
      } catch {
        const freshConversation = sharedConversation || createConversation();
        setConversations([freshConversation]);
        setActiveConversationId(freshConversation.id);
      } finally {
        if (!cancelled) {
          setHistoryReady(true);
          setRemoteReady(true);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [syncReadiness.ready]);

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
    if (!historyReady || !remoteReady || !syncReadiness.ready || loading) return;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversations,
            activeConversationId,
            usageTimestamps,
          }),
        });

        if (response.status === 401) {
          setSyncStatus("Sign in to sync");
          return;
        }

        setSyncStatus(response.ok ? "Synced just now" : "Cloud sync pending");
      } catch {
        setSyncStatus("Cloud sync unavailable");
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [
    conversations,
    activeConversationId,
    usageTimestamps,
    historyReady,
    remoteReady,
    syncReadiness.ready,
    loading,
  ]);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return undefined;
    }

    setVoiceSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      const prefix = voiceBaseInputRef.current;
      setInput(prefix ? `${prefix} ${transcript}`.trim() : transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setBanner({
        tone: "error",
        message: "Voice capture was interrupted. Try again.",
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    await queueAttachments(files);
    event.target.value = "";
  }

  async function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    await queueAttachments(files);
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    await queueAttachments(Array.from(event.dataTransfer?.files || []));
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragActive(false);
  }

  async function sendMessage() {
    if (
      (!input.trim() && pendingAttachments.length === 0) ||
      loading ||
      cooldown > 0 ||
      !activeConversation
    ) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMessage],
          model: activeConversation.model,
          systemPrompt: activeConversation.systemPrompt,
          researchMode: activeConversation.researchMode,
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
            ...conversation.messages.filter(
              (message) => message.id !== streamingMessageId
            ),
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: errorMessage,
            },
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
        streamedText += decoder.decode(value, { stream: true });
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
    setShowPromptEditor(false);
  }

  function resetConversation() {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, () => ({
      title: "New conversation",
      messages: [DEFAULT_ASSISTANT_MESSAGE],
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      researchMode: false,
    }));
    setInput("");
    setPendingAttachments([]);
    setCooldown(0);
  }

  function renameConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;
    setPendingRenameConversationId(id);
    setRenameDraft(conversation.title);
  }

  function deleteConversation(id) {
    setPendingDeleteConversationId(id);
  }

  function closeDialogs() {
    setPendingDeleteConversationId(null);
    setPendingRenameConversationId(null);
    setRenameDraft("");
  }

  function confirmDeleteConversation() {
    if (!pendingDeleteConversationId) return;

    setConversations((current) => {
      const remaining = current.filter(
        (conversation) => conversation.id !== pendingDeleteConversationId
      );

      if (remaining.length === 0) {
        const freshConversation = createConversation();
        setActiveConversationId(freshConversation.id);
        return [freshConversation];
      }

      if (pendingDeleteConversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }

      return remaining;
    });

    closeDialogs();
    setBanner({ tone: "success", message: "Conversation deleted." });
  }

  function saveRenameConversation() {
    const nextTitle = renameDraft.trim();
    if (!pendingRenameConversationId || !nextTitle) {
      closeDialogs();
      return;
    }

    updateConversation(pendingRenameConversationId, () => ({ title: nextTitle }));
    closeDialogs();
    setBanner({ tone: "success", message: "Conversation renamed." });
  }

  function changeModel(nextModel) {
    if (!activeConversation) return;
    updateConversation(activeConversation.id, () => ({ model: nextModel }));
  }

  function toggleResearchMode() {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, (conversation) => ({
      researchMode: !conversation.researchMode,
    }));
    setBanner({
      tone: "info",
      message: researchMode
        ? "Research mode disabled."
        : "Research mode enabled. Vanta will pull lightweight web context when possible.",
    });
  }

  function updateSystemPrompt(nextPrompt) {
    if (!activeConversation) return;
    updateConversation(activeConversation.id, () => ({ systemPrompt: nextPrompt }));
  }

  function applyPreset(value) {
    setInput((current) => (current ? `${value}\n\n${current}` : value));
  }

  function removeAttachment(id) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== id)
    );
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
      if (syncReadiness.ready) {
        const response = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation: activeConversation }),
        });

        if (response.ok) {
          const data = await response.json();
          await navigator.clipboard.writeText(data.url);
          updateConversation(activeConversation.id, () => ({
            publicToken: data.publicToken,
            shared: true,
          }));
          setBanner({ tone: "success", message: "Public share link copied." });
          return;
        }
      }

      if (hasImageAttachments(activeConversation)) {
        setBanner({
          tone: "error",
          message:
            "Image-heavy conversations need account sync before they can be shared reliably.",
        });
        return;
      }

      await navigator.clipboard.writeText(buildShareUrl(activeConversation));
      setBanner({ tone: "info", message: "Local share link copied." });
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
      const attachments = (message.attachments || []).map(
        (attachment) => `Attachment: ${attachment.name}`
      );
      return `${speaker}\n${message.content}\n${
        attachments.length ? `${attachments.join("\n")}\n` : ""
      }`;
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      activeConversation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
      "conversation"
    }.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setBanner({ tone: "success", message: "Conversation exported." });
  }

  function toggleVoiceInput() {
    if (!voiceSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    voiceBaseInputRef.current = input.trim();
    recognitionRef.current.start();
    setIsListening(true);
  }

  const hasStreamingPlaceholder = messages.some(
    (message) => message.role === "assistant" && !message.content?.trim()
  );
  const buttonLabel =
    cooldown > 0 ? `Wait ${cooldown}s` : loading ? "Working..." : "Send";

  return (
    <main className="min-h-screen bg-[#05010b] text-white">
      <div className="mx-auto max-w-[1420px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-[1.9rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-3 rounded-[0.95rem] border border-violet-400/15 bg-violet-500/8 px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_16px_#8b5cf6]" />
                <span className="text-[11px] font-medium uppercase tracking-[0.35em] text-violet-200">
                  Vanta
                </span>
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
                Focused AI,
                <span className="block text-white/50">without the interface noise.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/54 sm:text-[15px]">
                Streaming chat, search-ready conversations, public share pages,
                pasted screenshots, and cloud sync when your account is connected.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              {clerkEnabled ? (
                <AuthControls />
              ) : (
                <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white/50">
                  Auth setup pending
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
                <MetaCard
                  label="Model"
                  value={
                    MODEL_OPTIONS.find((item) => item.value === activeModel)?.label ||
                    "Custom"
                  }
                />
                <MetaCard label="Plan" value="Free" />
                <MetaCard label="Cooldown" value={cooldown > 0 ? `${cooldown}s` : "Ready"} />
                <MetaCard label="Sync" value={formatSyncStatus(syncStatus)} />
              </div>
            </div>
          </div>
        </header>

        {banner && (
          <div
            className={`mb-4 rounded-[1rem] border px-4 py-3 text-sm ${
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

        <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-5">
            <Panel>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                  Conversations
                </p>
                <button
                  onClick={createNewConversation}
                  className="rounded-[0.95rem] border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/80 transition hover:bg-white/[0.09]"
                >
                  New
                </button>
              </div>
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Search conversations"
                className="mt-4 w-full rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/28"
              />
              <div className="mt-4 space-y-2">
                {filteredConversations.length === 0 && (
                  <div className="rounded-[1rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/40">
                    Nothing matches this search yet.
                  </div>
                )}
                {filteredConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`rounded-[1rem] border px-4 py-3 transition ${
                      conversation.id === activeConversationId
                        ? "border-violet-400/25 bg-violet-500/8"
                        : "border-white/6 bg-white/[0.02]"
                    }`}
                  >
                    <button
                      onClick={() => setActiveConversationId(conversation.id)}
                      className="w-full text-left"
                    >
                      <p className="truncate text-sm font-medium text-white">
                        {conversation.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/40">
                        <span>
                          {MODEL_OPTIONS.find((item) => item.value === conversation.model)
                            ?.label || conversation.model}
                        </span>
                        {conversation.researchMode && <span>Research</span>}
                        {conversation.publicToken && <span>Shared</span>}
                      </div>
                    </button>
                    <div className="mt-3 flex gap-3 text-xs text-white/40">
                      <button className="transition hover:text-white/75" onClick={() => renameConversation(conversation.id)}>Rename</button>
                      <button className="transition hover:text-red-200" onClick={() => deleteConversation(conversation.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                Analytics
              </p>
              <div className="mt-4 space-y-3">
                <SidebarCard label="Conversations" value={String(analytics.conversationCount)} />
                <SidebarCard label="Total messages" value={String(analytics.totalMessages)} />
                <SidebarCard label="Your messages" value={String(analytics.userMessages)} />
                <SidebarCard label="Avg / chat" value={String(analytics.averageMessages)} />
              </div>
            </Panel>

            <Panel>
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
                Workspace
              </p>
              <div className="mt-4 space-y-3">
                <SidebarCard label="Input" value="Enter to send" />
                <SidebarCard label="Voice" value={voiceSupported ? "Ready" : "Not supported"} />
                <SidebarCard label="Rate limit" value="2 requests per minute" />
                <SidebarCard label="Storage" value="Local + account sync ready" />
                <SidebarCard label="Sharing" value={syncReadiness.ready ? "Public pages + local share links" : "Local share links"} />
                <SidebarCard label="Sync state" value={formatSyncStatus(syncStatus)} />
              </div>
            </Panel>
          </aside>

          <section
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-[1.7rem] border bg-[#090410]/84 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)] backdrop-blur sm:p-6 ${
              dragActive ? "border-violet-400/35" : "border-white/8"
            }`}
          >
            {dragActive && (
              <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-[1.4rem] border border-dashed border-violet-400/40 bg-violet-500/8 text-sm text-violet-100">
                Drop screenshots, images, or files anywhere in the workspace
              </div>
            )}

            <WorkspaceHeader
              activeConversation={activeConversation}
              activeModel={activeModel}
              buttonLabel={buttonLabel}
              changeModel={changeModel}
              cooldown={cooldown}
              copyMessage={copyMessage}
              exportConversation={exportConversation}
              fileInputRef={fileInputRef}
              hasCustomPrompt={hasCustomPrompt}
              hasStreamingPlaceholder={hasStreamingPlaceholder}
              input={input}
              isListening={isListening}
              loading={loading}
              messages={messages}
              messagesEndRef={messagesEndRef}
              pendingAttachments={pendingAttachments}
              removeAttachment={removeAttachment}
              researchMode={researchMode}
              setInput={setInput}
              setShowPromptEditor={setShowPromptEditor}
              shareConversation={shareConversation}
              showPromptEditor={showPromptEditor}
              syncStatus={syncStatus}
              toggleResearchMode={toggleResearchMode}
              toggleVoiceInput={toggleVoiceInput}
              updateSystemPrompt={updateSystemPrompt}
              activeSystemPrompt={activeSystemPrompt}
              usageCount={usageCount}
              handleAttachmentChange={handleAttachmentChange}
              handleKeyDown={handleKeyDown}
              handlePaste={handlePaste}
              sendMessage={sendMessage}
              voiceSupported={voiceSupported}
              resetConversation={resetConversation}
              applyPreset={applyPreset}
            />
          </section>
        </section>
      </div>

      {(pendingDeleteConversationId || pendingRenameConversationId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] border border-white/8 bg-[#12091d] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-violet-200/70">
                Vanta
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                {pendingRenameConversationId ? "Rename conversation" : "Delete conversation"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/58">
                {pendingRenameConversationId ? "Give this conversation a clearer name." : "This conversation will be removed from your workspace."}
              </p>
            </div>
            {pendingRenameConversationId && (
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveRenameConversation();
                  if (event.key === "Escape") closeDialogs();
                }}
                className="w-full rounded-[0.95rem] border border-white/8 bg-[#090410] px-4 py-3 text-white outline-none placeholder:text-white/25"
                placeholder="Conversation name"
              />
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeDialogs} className="rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08]">Cancel</button>
              <button
                onClick={pendingRenameConversationId ? saveRenameConversation : confirmDeleteConversation}
                className={`rounded-[0.95rem] px-4 py-2 text-sm font-medium text-white transition ${
                  pendingRenameConversationId
                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[0_12px_32px_rgba(168,85,247,0.25)] hover:brightness-110"
                    : "bg-red-500/85 hover:bg-red-500"
                }`}
              >
                {pendingRenameConversationId ? "Save" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function WorkspaceHeader({
  activeConversation,
  activeModel,
  buttonLabel,
  changeModel,
  cooldown,
  copyMessage,
  exportConversation,
  fileInputRef,
  hasCustomPrompt,
  hasStreamingPlaceholder,
  input,
  isListening,
  loading,
  messages,
  messagesEndRef,
  pendingAttachments,
  removeAttachment,
  researchMode,
  setInput,
  setShowPromptEditor,
  shareConversation,
  showPromptEditor,
  syncStatus,
  toggleResearchMode,
  toggleVoiceInput,
  updateSystemPrompt,
  activeSystemPrompt,
  usageCount,
  handleAttachmentChange,
  handleKeyDown,
  handlePaste,
  sendMessage,
  voiceSupported,
  resetConversation,
  applyPreset,
}) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-4 border-b border-white/8 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/32">
              Conversation
            </p>
            <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.035em] text-white">
              {activeConversation?.title || "Chat"}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={activeModel}
              onChange={(event) => changeModel(event.target.value)}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70 outline-none"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={toggleResearchMode}
              className={`rounded-[0.95rem] border px-3 py-2.5 text-sm transition ${
                researchMode
                  ? "border-violet-400/25 bg-violet-500/12 text-violet-100"
                  : "border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
              }`}
            >
              {researchMode ? "Research on" : "Research off"}
            </button>
            <button
              onClick={shareConversation}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              Share
            </button>
            <button
              onClick={exportConversation}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              Export
            </button>
            <button
              onClick={resetConversation}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              Reset
            </button>
            {cooldown > 0 && (
              <div className="rounded-[0.95rem] border border-violet-400/18 bg-violet-500/10 px-3 py-2.5 text-sm text-violet-200">
                Wait {cooldown}s
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-wrap gap-2">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.value)}
                className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/62 transition hover:bg-white/[0.06]"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/62 transition hover:bg-white/[0.06]"
            >
              Attach files
            </button>
            <button
              onClick={toggleVoiceInput}
              disabled={!voiceSupported}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/62 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-white/28"
            >
              {isListening ? "Stop mic" : "Voice input"}
            </button>
          </div>

          <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.025] p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/35">
              Assistant settings
            </p>
            <p className="mt-3 text-sm leading-6 text-white/52">
              {hasCustomPrompt
                ? "Custom instructions are active for this conversation."
                : "Using the default Vanta behavior."}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/38">
              {researchMode
                ? "Research mode will add lightweight web context and source-friendly structure."
                : "Enable research mode when you want web context and citations."}
            </p>
            <button
              onClick={() => setShowPromptEditor((current) => !current)}
              className="mt-4 w-full rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white/72 transition hover:bg-white/[0.06]"
            >
              {showPromptEditor ? "Hide instructions" : "Edit instructions"}
            </button>
          </div>
        </div>

        {showPromptEditor && (
          <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.025] p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/35">
              Conversation instructions
            </p>
            <textarea
              value={activeSystemPrompt}
              onChange={(event) => updateSystemPrompt(event.target.value)}
              rows={5}
              className="mt-3 w-full resize-none rounded-[1rem] border border-white/10 bg-transparent px-3 py-3 text-sm leading-6 text-white/78 outline-none placeholder:text-white/25"
            />
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/42">
        <span>{usageCount}/2 requests in the last minute</span>
        <span className="text-white/18">|</span>
        <span>Shift+Enter for newline</span>
        <span className="text-white/18">|</span>
        <span>Streaming enabled</span>
        <span className="text-white/18">|</span>
        <span>{voiceSupported ? "Voice input ready" : "Voice input unsupported"}</span>
        <span className="text-white/18">|</span>
        <span>{formatSyncStatus(syncStatus)}</span>
      </div>

      {pendingAttachments.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-[0.95rem] border border-white/8 bg-white/[0.035] p-3"
            >
              {attachment.kind === "image" && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.data}
                    alt={attachment.name}
                    className="mb-3 h-36 w-full rounded-[0.8rem] object-cover"
                  />
                </>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-white/70">{attachment.name}</span>
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className="text-sm text-white/45 transition hover:text-white/75"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-[500px] overflow-y-auto rounded-[1.45rem] border border-white/8 bg-[#07030d] p-4 sm:h-[580px] sm:p-5">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const showStreamingDots =
              loading && message.role === "assistant" && !message.content?.trim();

            return (
              <div
                key={message.id || index}
                className={`max-w-[85%] rounded-[1.2rem] px-4 py-3 sm:px-5 sm:py-4 ${
                  message.role === "user"
                    ? "ml-auto bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-500 text-white shadow-[0_10px_28px_rgba(168,85,247,0.22)]"
                    : "border border-white/6 bg-white/[0.04] text-white"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                    {message.role === "user" ? "You" : "Vanta"}
                  </p>
                  {message.content?.trim() && (
                    <button
                      onClick={() => copyMessage(message.content, message.id || index)}
                      className="text-xs text-white/40 transition hover:text-white/75"
                    >
                      Copy
                    </button>
                  )}
                </div>
                {showStreamingDots ? (
                  <div className="flex items-center gap-3 text-white/72">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.3s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.15s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-300" />
                    </div>
                    <span className="text-sm text-white/58 sm:text-[15px]">
                      Generating response...
                    </span>
                  </div>
                ) : (
                  <MessageBody
                    content={message.content}
                    user={message.role === "user"}
                    attachments={message.attachments}
                  />
                )}
              </div>
            );
          })}

          {loading && !hasStreamingPlaceholder && (
            <div className="max-w-[85%] rounded-[1.2rem] border border-white/6 bg-white/[0.04] px-5 py-4 text-white">
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

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_176px]">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={3}
          placeholder="Type your message, paste a screenshot, or drag files in..."
          className="min-h-[108px] resize-none rounded-[1.25rem] border border-white/8 bg-[#07030d] px-5 py-4 text-white outline-none placeholder:text-white/28 focus:border-violet-400/30"
        />
        <button
          onClick={sendMessage}
          disabled={loading || cooldown > 0 || (!input.trim() && pendingAttachments.length === 0)}
          className="rounded-[1.25rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 px-6 py-4 text-base font-medium text-white shadow-[0_12px_30px_rgba(168,85,247,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28 disabled:shadow-none"
        >
          {buttonLabel}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,image/*"
        onChange={handleAttachmentChange}
      />
    </>
  );
}

function Panel({ children }) {
  return (
    <div className="rounded-[1.6rem] border border-white/8 bg-[#090410]/88 p-5 shadow-[0_14px_48px_rgba(0,0,0,0.22)]">
      {children}
    </div>
  );
}

function AuthControls() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white/50">
        Checking account
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex flex-wrap gap-2">
        <SignInButton mode="modal">
          <button className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-white/78 transition hover:bg-white/[0.06]">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="rounded-[0.95rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(168,85,247,0.24)] transition hover:brightness-110">
            Create account
          </button>
        </SignUpButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-white/50">Account sync is active</span>
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}

function MetaCard({ label, value }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-[#090410]/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/26">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white/92">{value}</p>
    </div>
  );
}

function SidebarCard({ label, value }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-[#090410]/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/26">
        {label}
      </p>
      <p className="mt-2 text-sm text-white/80">{value}</p>
    </div>
  );
}
