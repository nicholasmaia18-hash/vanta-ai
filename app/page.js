"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageBody } from "./components/message-body";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/vanta-db";
import { getSyncReadiness } from "./lib/sync-config";
import { mergeConversations, sortConversations } from "./lib/supabase";

const STORAGE_KEYS = {
  cooldownUntil: "vanta_cooldown_until",
  visionCooldownUntil: "vanta_vision_cooldown_until",
};
const CANONICAL_API_ORIGIN = "https://vanta-ai-chat.vercel.app";
const AUTO_MODEL = "vanta/auto";
const SMART_MODEL = "vanta/smart";
const FAST_MODEL = "openai/gpt-oss-120b";
const MODEL_OPTIONS = [
  { label: "Auto · fast + smart", value: AUTO_MODEL },
  { label: "GPT-5.4 · deepest", value: SMART_MODEL },
  { label: "GPT-OSS 120B · fastest", value: FAST_MODEL },
];
const MODEL_DISPLAY_NAMES = {
  [AUTO_MODEL]: "Auto",
  [SMART_MODEL]: "GPT-5.4",
  [FAST_MODEL]: "GPT-OSS 120B",
  "openai/gpt-5.4": "GPT-5.4",
};
const PROMPT_PRESETS = [
  { label: "Explain", value: "Explain this clearly in simple terms:" },
  { label: "Summarize", value: "Summarize this into the key points:" },
  { label: "Rewrite", value: "Rewrite this to sound more polished:" },
  { label: "Debug", value: "Debug this step by step and point out the likely cause:" },
];
const STARTER_PROMPTS = [
  {
    title: "Summarize notes",
    prompt: "Summarize this article into five takeaways.",
    hint: "Turn rough material into a short list of what matters.",
  },
  {
    title: "Draft a message",
    prompt: "Help me turn these notes into a polished email.",
    hint: "Write a cleaner email, DM, or status update.",
  },
  {
    title: "Review a screenshot",
    prompt: "Look at this screenshot and explain what stands out.",
    hint: "Break down an interface, error, or visual detail.",
  },
];
const SCHOOL_SUPPORT_OPTIONS = [
  {
    title: "Reading check",
    apps: "Reading Plus, i-Ready Reading, passages",
    prompt:
      "I'm working in Reading Plus or i-Ready Reading. I will paste the passage, question, answer choices, and my best answer. Check my reasoning, explain what the question is asking, and show me how to prove the right answer from the text.",
    guidance:
      "For reading check mode, help the user verify their reasoning. Ask for the passage, question, choices, and their attempted answer when needed. Explain main idea, author's purpose, vocabulary, evidence, and why choices are stronger or weaker. Do not act like an answer sheet or simply complete graded schoolwork. Focus on proof from the text and learning the pattern.",
  },
  {
    title: "IXL / i-Ready check",
    apps: "IXL, i-Ready Math, class practice",
    prompt:
      "I'm working in IXL or i-Ready Math. I will paste the problem or screenshot and my attempt. Check where I went right or wrong, explain the method, and give me one similar practice problem so I can make sure I understand it.",
    guidance:
      "For IXL and i-Ready check mode, review the user's attempt, identify the exact step that needs fixing, teach the method, and offer a similar practice problem. Do not bypass learning platforms, provide answer-sheet style responses, or help the user cheat. Focus on checking work, correcting mistakes, and building mastery.",
  },
];
const SLASH_COMMANDS = Object.fromEntries(
  PROMPT_PRESETS.map((preset) => [preset.label.toLowerCase(), preset.value])
);
const DEFAULT_SYSTEM_PROMPT =
  "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing. For schoolwork, use a check-my-work approach: help the user verify attempts, understand mistakes, and learn the method rather than acting as an answer sheet.";
const DEFAULT_ASSISTANT_MESSAGE = {
  id: "default-assistant",
  role: "assistant",
  content:
    "Vanta is online. Ask a question to begin.\n\nI can also help with:\n- research mode with web context\n- pasted screenshots and images\n- files, code, and quick exports",
};
const MAX_REQUEST_HISTORY = 120;
const REQUEST_CONTEXT_MESSAGES = 18;
const REQUEST_VISION_CONTEXT_MESSAGES = 6;
const REQUEST_ATTACHMENT_WINDOW = 4;
const REQUEST_VISION_ATTACHMENT_WINDOW = 2;
const MAX_IMAGE_DIMENSION = 1400;
const IMAGE_EXPORT_QUALITY = 0.86;
const MAX_IMAGE_DATA_CHARS = 1_800_000;
const SCREEN_ASSISTANT_MESSAGE_SOURCE = "vanta-screen-assistant";
const SCREEN_ASSISTANT_IDLE_TEXT =
  "Ask about the current screen and Vanta's answer will appear here.";

function getScreenAssistantPopupHtml(openerOrigin = "") {
  const trustedOrigin = JSON.stringify(openerOrigin);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vanta Screen</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #030711;
        color: white;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        min-height: 100vh;
        padding: 10px;
        background: #030711;
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        padding: 8px 10px;
        border: 1px solid rgba(96, 165, 250, 0.34);
        border-radius: 12px;
        background: rgba(6, 12, 28, 0.92);
      }
      .brand {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.64);
      }
      .status {
        border: 1px solid rgba(110, 231, 183, 0.26);
        border-radius: 999px;
        padding: 5px 10px;
        background: rgba(16, 185, 129, 0.1);
        color: #d1fae5;
        font-size: 12px;
      }
      textarea, .answer {
        width: 100%;
        border: 1px solid rgba(96, 165, 250, 0.24);
        border-radius: 14px;
        background: rgba(8, 13, 28, 0.95);
        color: white;
      }
      textarea {
        min-height: 80px;
        resize: vertical;
        padding: 12px;
        outline: none;
        font: inherit;
        font-size: 13px;
      }
      textarea:focus { border-color: rgba(147, 197, 253, 0.56); }
      .answer {
        min-height: 90px;
        margin-top: 8px;
        padding: 10px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.55;
      }
      .answer[hidden] { display: none; }
      .label {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.44);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      button {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        background: rgba(255,255,255,0.045);
        color: rgba(255,255,255,0.8);
        padding: 8px 10px;
        font: inherit;
        cursor: pointer;
      }
      button:hover { background: rgba(255,255,255,0.08); }
      button:disabled {
        cursor: not-allowed;
        color: rgba(255,255,255,0.34);
        background: rgba(255,255,255,0.035);
      }
      .primary {
        background: #60a5fa;
        color: white;
        border-color: rgba(255,255,255,0.16);
      }
      .spacer { flex: 1; }
    </style>
  </head>
  <body>
    <main class="panel">
      <div class="top">
        <div class="brand">Vanta screen</div>
        <div id="status" class="status">Opening...</div>
      </div>
      <textarea id="prompt" placeholder="Ask about your current screen..."></textarea>
      <section id="answer-panel" class="answer" hidden>
        <div class="label">Vanta says</div>
        <div id="answer">Ask about the current screen and Vanta's answer will appear here.</div>
      </section>
      <div class="actions">
        <button id="stop">Stop sharing</button>
        <button id="ask" class="primary">Ask</button>
        <span class="spacer"></span>
        <button id="close">Close</button>
      </div>
    </main>
    <script>
      const SOURCE = "${SCREEN_ASSISTANT_MESSAGE_SOURCE}";
      const TRUSTED_ORIGIN = ${trustedOrigin};
      const promptBox = document.getElementById("prompt");
      const answerBox = document.getElementById("answer");
      const answerPanel = document.getElementById("answer-panel");
      const statusBox = document.getElementById("status");
      const askButton = document.getElementById("ask");
      const idleAnswer = "Ask about the current screen and Vanta's answer will appear here.";

      function send(type, payload = {}) {
        if (!window.opener || window.opener.closed) return;
        window.opener.postMessage({ source: SOURCE, type, ...payload }, TRUSTED_ORIGIN || "*");
      }

      document.getElementById("ask").addEventListener("click", () => {
        send("ask", { prompt: promptBox.value });
      });
      document.getElementById("stop").addEventListener("click", () => send("stop"));
      document.getElementById("close").addEventListener("click", () => {
        send("close");
        window.close();
      });
      promptBox.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          send("ask", { prompt: promptBox.value });
        }
      });

      window.addEventListener("message", (event) => {
        if (TRUSTED_ORIGIN && event.origin !== TRUSTED_ORIGIN) return;
        const data = event.data || {};
        if (data.source !== SOURCE || data.type !== "state") return;

        const active = data.screenShareStatus === "active";
        statusBox.textContent = active ? "Sharing active" : "Not sharing";
        const nextAnswer = data.screenAnswer || idleAnswer;
        answerBox.textContent = nextAnswer;
        answerPanel.hidden = !nextAnswer || nextAnswer === idleAnswer;

        if (document.activeElement !== promptBox && typeof data.screenPrompt === "string") {
          promptBox.value = data.screenPrompt;
        }

        const visionCooldown = Number(data.visionCooldown || 0);
        askButton.disabled = Boolean(data.loading) || !active || visionCooldown > 0;
        askButton.textContent = visionCooldown > 0
          ? "Image wait " + visionCooldown + "s"
          : data.loading
            ? "Working..."
            : "Ask";
      });

      window.addEventListener("beforeunload", () => send("popupClosed"));
      send("ready");
    </script>
  </body>
</html>`;
}

function getApiUrl(path) {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "");
  if (configuredOrigin) return `${configuredOrigin}${path}`;

  if (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".b-cdn.net")
  ) {
    return `${CANONICAL_API_ORIGIN}${path}`;
  }

  return path;
}

function normalizeModelValue(model) {
  if (!model || model === "openai/gpt-5.4") return AUTO_MODEL;
  return model;
}

function getModelDisplayName(model) {
  return MODEL_DISPLAY_NAMES[model] || model || "Auto";
}

function messageHasImageAttachment(message) {
  return (message?.attachments || []).some((attachment) => attachment.kind === "image");
}

function messagesIncludeImage(messages = []) {
  return messages.some(messageHasImageAttachment);
}

function prepareMessagesForRequest(messages) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const hasCurrentImage = messageHasImageAttachment(latestUserMessage);
  const contextLimit = hasCurrentImage
    ? REQUEST_VISION_CONTEXT_MESSAGES
    : REQUEST_CONTEXT_MESSAGES;
  const attachmentWindow = hasCurrentImage
    ? REQUEST_VISION_ATTACHMENT_WINDOW
    : REQUEST_ATTACHMENT_WINDOW;
  const recentMessages = messages.slice(-contextLimit);

  return recentMessages.map((message, index) => {
    const keepAttachments = recentMessages.length - index <= attachmentWindow;

    if (keepAttachments || !message.attachments?.length) return message;

    const attachmentNames = message.attachments
      .map((attachment) => attachment.name)
      .filter(Boolean)
      .join(", ");

    return {
      ...message,
      attachments: [],
      content: [
        getMessageContentText(message),
        attachmentNames
          ? `[Older attachments omitted for faster responses: ${attachmentNames}]`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  });
}

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

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function getLatestRetryContext(messages = []) {
  const lastUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user")?.index;

  if (typeof lastUserIndex !== "number") return null;

  const requestMessages = messages
    .slice(0, lastUserIndex + 1)
    .filter((message) => !(message.role === "assistant" && !getMessageContentText(message).trim()));

  return {
    lastUserIndex,
    requestMessages,
  };
}

function normalizeConversation(conversation) {
  return {
    ...conversation,
    model: normalizeModelValue(conversation.model),
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

  if (isImage) {
    const optimizedImage = await optimizeImageDataUrl(data);

    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: optimizedImage.mimeType,
      kind: "image",
      data: optimizedImage.data,
    };
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    kind: "text",
    data,
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be loaded."));
    image.src = dataUrl;
  });
}

async function optimizeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Screenshot upload failed. Try saving it as PNG or JPG first.");
  }

  const image = await loadImage(dataUrl);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not prepare the image.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const exportTypes = ["image/jpeg", "image/png"];
  let bestData = dataUrl;
  let bestMimeType = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";

  for (const mimeType of exportTypes) {
    const nextData = canvas.toDataURL(mimeType, IMAGE_EXPORT_QUALITY);
    if (nextData.length < bestData.length) {
      bestData = nextData;
      bestMimeType = mimeType;
    }
  }

  if (bestData.length > MAX_IMAGE_DATA_CHARS) {
    throw new Error(
      "That screenshot is too large to analyze. Try cropping it to the important part and upload again."
    );
  }

  return {
    data: bestData,
    mimeType: bestMimeType,
  };
}

function waitForVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const events = ["loadedmetadata", "loadeddata", "canplay"];

    function cleanup() {
      window.clearTimeout(timeout);
      events.forEach((eventName) => video.removeEventListener(eventName, handleReady));
    }

    function handleReady() {
      if (settled || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      settled = true;
      cleanup();
      resolve();
    }

    timeout = window.setTimeout(() => {
      settled = true;
      cleanup();
      reject(new Error("Screen sharing is not ready yet. Try again in a second."));
    }, 3500);

    events.forEach((eventName) => video.addEventListener(eventName, handleReady));
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(handleReady);
    }
  });
}

async function createScreenFrameAttachment(video) {
  await waitForVideoFrame(video);

  const longestSide = Math.max(video.videoWidth, video.videoHeight);
  const scale = longestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not capture the shared screen.");
  }

  context.drawImage(video, 0, 0, width, height);
  const data = canvas.toDataURL("image/jpeg", IMAGE_EXPORT_QUALITY);

  if (data.length > MAX_IMAGE_DATA_CHARS) {
    throw new Error("That screen is too large to analyze. Share a smaller window or tab.");
  }

  return {
    id: crypto.randomUUID(),
    name: "shared-screen.jpg",
    mimeType: "image/jpeg",
    kind: "image",
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

function formatConversationUpdatedAt(timestamp) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const minutes = Math.max(1, Math.round(diff / minute));
    return `${minutes}m ago`;
  }

  if (diff < day) {
    const hours = Math.round(diff / hour);
    return `${hours}h ago`;
  }

  const days = Math.round(diff / day);
  return `${days}d ago`;
}

function conversationHasSavedItems(conversation) {
  return conversation.messages.some(
    (message) => message.favorite || message.pinned || message.feedback === "up"
  );
}

function conversationHasCustomInstructions(conversation) {
  return (conversation.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() !==
    DEFAULT_SYSTEM_PROMPT.trim();
}

function getMessageContentText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function buildSchoolSupportPrompt(option) {
  return `${DEFAULT_SYSTEM_PROMPT}\n\nSchool support mode: ${option.guidance}`;
}

function getConversationPreview(conversation) {
  const latestMessage = [...conversation.messages]
    .reverse()
    .find(
      (message) =>
        message.id !== DEFAULT_ASSISTANT_MESSAGE.id &&
        (getMessageContentText(message).trim() || (message.attachments || []).length > 0)
    );

  if (!latestMessage) return "No messages yet.";

  const latestText = getMessageContentText(latestMessage);
  if (latestText.trim()) {
    return latestText.trim().replace(/\s+/g, " ").slice(0, 72);
  }

  const attachmentCount = latestMessage.attachments?.length || 0;
  return `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"} ready`;
}

function normalizeComposerInput(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return trimmed;

  const [command, ...rest] = trimmed.slice(1).split(/\s+/);
  const preset = SLASH_COMMANDS[command?.toLowerCase()];
  const remainder = rest.join(" ").trim();

  if (!preset || !remainder) return trimmed;
  return `${preset}\n\n${remainder}`;
}

function getRetrySeconds(value, fallback = 0) {
  const seconds = Math.ceil(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

function formatWaitDuration(seconds) {
  const safeSeconds = Math.max(1, getRetrySeconds(seconds, 1));
  if (safeSeconds < 60) {
    return `${safeSeconds} second${safeSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  const minuteText = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const secondText = remainder
    ? ` ${remainder} second${remainder === 1 ? "" : "s"}`
    : "";

  return `${minuteText}${secondText}`;
}

function scoreConversationMatch(conversation, query) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return 0;

  const title = conversation.title.toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const recentMessages = [...conversation.messages].reverse().slice(0, 6);
  const allContent = [title, ...conversation.messages.map(getMessageContentText)]
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (title === normalizedQuery) score += 140;
  else if (title.startsWith(normalizedQuery)) score += 100;
  else if (title.includes(normalizedQuery)) score += 70;

  if (allContent.includes(normalizedQuery)) score += 30;

  tokens.forEach((token) => {
    if (title.includes(token)) score += 18;
    if (recentMessages.some((message) => getMessageContentText(message).toLowerCase().includes(token))) {
      score += 12;
    } else if (allContent.includes(token)) {
      score += 6;
    }
  });

  if (conversationHasSavedItems(conversation)) score += 12;
  if (conversationHasCustomInstructions(conversation)) score += 8;

  return score;
}

function getAssistantContextBadges(message) {
  if (message.role !== "assistant" || !message.requestContext) return [];

  const badges = [];
  if (message.requestContext.modelLabel) badges.push(message.requestContext.modelLabel);
  if (message.requestContext.researchEnabled) badges.push("Web context enabled");
  if (message.requestContext.contextMessageCount > 0) {
    badges.push(`${message.requestContext.contextMessageCount} messages used`);
  }
  if (message.requestContext.attachmentCount > 0) {
    badges.push(
      `${message.requestContext.attachmentCount} attachment${
        message.requestContext.attachmentCount === 1 ? "" : "s"
      } included`
    );
  }
  if (message.requestContext.customInstructions) badges.push("Custom instructions");
  return badges;
}

function isProviderCooldownMessage(message) {
  return ["provider_cooldown", "vision_cooldown"].includes(
    message?.requestContext?.errorType
  );
}

function areDraftAttachmentsEqual(left = [], right = []) {
  if (left.length !== right.length) return false;

  return left.every((attachment, index) => {
    const nextAttachment = right[index];
    return (
      attachment?.id === nextAttachment?.id &&
      attachment?.name === nextAttachment?.name &&
      attachment?.kind === nextAttachment?.kind &&
      attachment?.mimeType === nextAttachment?.mimeType &&
      attachment?.data === nextAttachment?.data
    );
  });
}

export default function Home() {
  const syncReadiness = getSyncReadiness();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [visionCooldown, setVisionCooldown] = useState(0);
  const [usageTimestamps, setUsageTimestamps] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [draftsByConversationId, setDraftsByConversationId] = useState({});
  const [requestHistory, setRequestHistory] = useState([]);
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
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showMobileConversations, setShowMobileConversations] = useState(false);
  const [screenShareStatus, setScreenShareStatus] = useState("idle");
  const [showScreenAssistant, setShowScreenAssistant] = useState(false);
  const [screenPrompt, setScreenPrompt] = useState("");
  const [screenAnswer, setScreenAnswer] = useState(SCREEN_ASSISTANT_IDLE_TEXT);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const screenVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenPopupRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceBaseInputRef = useRef("");
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const isRestoringDraftRef = useRef(false);
  const draftsByConversationIdRef = useRef(draftsByConversationId);
  const presetMenuRef = useRef(null);
  draftsByConversationIdRef.current = draftsByConversationId;

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
    if (!deferredConversationSearch.trim()) return sortConversations(conversations);
    const query = deferredConversationSearch.toLowerCase().trim();
    return sortConversations(conversations)
      .map((conversation) => ({
        conversation,
        score: scoreConversationMatch(conversation, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.conversation.updatedAt - left.conversation.updatedAt;
      })
      .map((entry) => entry.conversation);
  }, [deferredConversationSearch, conversations]);

  const conversationSections = useMemo(() => {
    if (deferredConversationSearch.trim()) {
      return [
        {
          title: "Search results",
          description:
            filteredConversations.length > 0
              ? `${filteredConversations.length} match${
                  filteredConversations.length === 1 ? "" : "es"
                } across titles and messages.`
              : "No conversations match this search yet.",
          conversations: filteredConversations,
        },
      ];
    }

    const saved = [];
    const recent = [];

    sortConversations(conversations).forEach((conversation) => {
      if (conversationHasSavedItems(conversation)) saved.push(conversation);
      else recent.push(conversation);
    });

    return [
      ...(saved.length > 0
        ? [
            {
              title: `Saved (${saved.length})`,
              description: "Pinned, favorited, or marked helpful.",
              conversations: saved,
            },
          ]
        : []),
      ...(recent.length > 0
        ? [
            {
              title: `Recent (${recent.length})`,
              description: "Latest conversations kept on this browser.",
              conversations: recent,
            },
          ]
        : []),
    ];
  }, [deferredConversationSearch, conversations, filteredConversations]);

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

  const usageDashboard = useMemo(() => {
    const todayStart = getStartOfToday();
    const todaysRequests = requestHistory.filter((entry) => entry.at >= todayStart);
    const successfulRequests = todaysRequests.filter((entry) => entry.status === "success");
    const averageLatency =
      successfulRequests.length > 0
        ? Math.round(
            successfulRequests.reduce((sum, entry) => sum + (entry.latencyMs || 0), 0) /
              successfulRequests.length
          )
        : 0;
    const favoriteCount = conversations.reduce(
      (sum, conversation) =>
        sum + conversation.messages.filter((message) => message.favorite).length,
      0
    );
    const pinnedCount = conversations.reduce(
      (sum, conversation) =>
        sum + conversation.messages.filter((message) => message.pinned).length,
      0
    );
    const likes = conversations.reduce(
      (sum, conversation) =>
        sum + conversation.messages.filter((message) => message.feedback === "up").length,
      0
    );
    const dislikes = conversations.reduce(
      (sum, conversation) =>
        sum + conversation.messages.filter((message) => message.feedback === "down").length,
      0
    );

    return {
      requestsToday: todaysRequests.length,
      successRate:
        todaysRequests.length > 0
          ? Math.round((successfulRequests.length / todaysRequests.length) * 100)
          : 100,
      averageLatency,
      rateLimited: todaysRequests.filter((entry) => entry.status === "rate_limited").length,
      favorites: favoriteCount,
      pinned: pinnedCount,
      likes,
      dislikes,
    };
  }, [conversations, requestHistory]);

  const latestRetryableAssistantId = useMemo(() => {
    const context = getLatestRetryContext(messages);
    if (!context) return null;

    const latestAssistant = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.id !== DEFAULT_ASSISTANT_MESSAGE.id &&
          getMessageContentText(message).trim()
      );

    return latestAssistant?.id || null;
  }, [messages]);

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

  function recordRequest(entry) {
    setRequestHistory((current) =>
      [...current, { id: crypto.randomUUID(), ...entry }].slice(-MAX_REQUEST_HISTORY)
    );
  }

  function updateMessage(messageId, updater) {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, (conversation) => ({
      messages: conversation.messages.map((message) =>
        message.id === messageId ? { ...message, ...updater(message) } : message
      ),
    }));
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

  function syncScreenAssistantPopup(overrides = {}) {
    const popup = screenPopupRef.current;
    if (!popup || popup.closed) {
      screenPopupRef.current = null;
      return;
    }

    popup.postMessage(
      {
        source: SCREEN_ASSISTANT_MESSAGE_SOURCE,
        type: "state",
        screenShareStatus,
        screenPrompt,
        screenAnswer,
        loading,
        visionCooldown,
        ...overrides,
      },
      window.location.origin
    );
  }

  function openScreenAssistantWindow() {
    if (typeof window === "undefined") return false;

    let popup = screenPopupRef.current;
    if (!popup || popup.closed) {
      popup = window.open(
        "",
        "vanta-screen-assistant",
        "popup=yes,width=430,height=350,left=80,top=80,toolbar=no,location=no,menubar=no,status=no,scrollbars=no,resizable=yes"
      );
    }

    if (!popup) return false;

    screenPopupRef.current = popup;
    if (!popup.document.body?.dataset?.vantaScreenReady) {
      popup.document.open();
      popup.document.write(getScreenAssistantPopupHtml(window.location.origin));
      popup.document.close();
      popup.document.body.dataset.vantaScreenReady = "true";
    }

    popup.focus();
    setTimeout(() => syncScreenAssistantPopup(), 80);
    return true;
  }

  function stopScreenShare(message = "Screen sharing stopped.") {
    const stream = screenStreamRef.current;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;

    if (screenVideoRef.current) {
      screenVideoRef.current.pause();
      screenVideoRef.current.srcObject = null;
    }

    setScreenShareStatus("idle");
    setShowScreenAssistant(false);
    setScreenPrompt("");
    setScreenAnswer(message || SCREEN_ASSISTANT_IDLE_TEXT);
    if (message) setBanner({ tone: "info", message });

    const popup = screenPopupRef.current;
    if (popup && !popup.closed) popup.close();
    screenPopupRef.current = null;
  }

  async function startScreenShare() {
    if (screenShareStatus === "active") {
      if (!openScreenAssistantWindow()) setShowScreenAssistant(true);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setBanner({
        tone: "error",
        message: "This browser does not support screen sharing. Try Chrome or Edge on desktop.",
      });
      return;
    }

    setScreenShareStatus("starting");
    setBanner(null);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });
      const video = screenVideoRef.current;

      screenStreamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => stopScreenShare("Screen sharing stopped.");
      });

      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      setScreenShareStatus("active");
      const popupOpened = openScreenAssistantWindow();
      setShowScreenAssistant(!popupOpened);
      setScreenAnswer(SCREEN_ASSISTANT_IDLE_TEXT);
      setTimeout(
        () =>
          syncScreenAssistantPopup({
            screenShareStatus: "active",
            screenAnswer: SCREEN_ASSISTANT_IDLE_TEXT,
          }),
        120
      );
      setBanner({
        tone: "info",
        message: "Screen sharing is active. Ask Vanta about the current screen when you're ready.",
      });
    } catch (error) {
      screenStreamRef.current = null;
      setScreenShareStatus("idle");
      setShowScreenAssistant(false);
      setScreenAnswer("Screen sharing did not start. Try again from Chrome or Edge.");
      setBanner({
        tone: "error",
        message:
          error?.name === "NotAllowedError"
            ? "Screen sharing was cancelled."
            : "Unable to start screen sharing in this browser.",
      });
    }
  }

  async function askAboutSharedScreen(promptOverride) {
    if (loading || !activeConversation) return;

    if (visionCooldown > 0) {
      const message = `Image analysis is cooling down for ${formatWaitDuration(visionCooldown)}. Wait for the timer, then ask once.`;
      setScreenAnswer(message);
      setBanner({ tone: "info", message });
      return;
    }

    const video = screenVideoRef.current;
    if (screenShareStatus !== "active" || !video) {
      setBanner({ tone: "error", message: "Start screen sharing before asking about the screen." });
      return;
    }

    try {
      setScreenAnswer("Capturing your screen...");
      const screenAttachment = await createScreenFrameAttachment(video);
      const conversationSnapshot = activeConversation;
      const promptText = typeof promptOverride === "string" ? promptOverride : screenPrompt;
      const prompt =
        normalizeComposerInput(promptText) ||
        "Look at my current screen and tell me what I should do next.";
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        attachments: [screenAttachment],
      };
      const hasMeaningfulTitle =
        conversationSnapshot.title && conversationSnapshot.title !== "New conversation";
      const nextTitle = hasMeaningfulTitle
        ? conversationSnapshot.title
        : createTitleFromMessage(prompt);
      const nextMessages = [...conversationSnapshot.messages, userMessage];

      setScreenPrompt("");
      setScreenAnswer("Vanta is reading the screen...");
      await requestAssistantReply({
        conversationSnapshot,
        requestMessages: nextMessages,
        visibleMessages: nextMessages,
        nextTitle,
        onStream: (text) => setScreenAnswer(text || "Vanta is reading the screen..."),
        onDone: (text) => setScreenAnswer(text || "No response returned."),
        onError: (message) => setScreenAnswer(message || "Unable to answer from the screen."),
      });
    } catch (error) {
      const message = error.message || "Unable to capture the shared screen.";
      setScreenAnswer(message);
      setBanner({
        tone: "error",
        message,
      });
    }
  }

  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (screenPopupRef.current && !screenPopupRef.current.closed) {
        screenPopupRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const handleScreenPopupMessage = (event) => {
      const isTrustedPopup =
        screenPopupRef.current && event.source === screenPopupRef.current;
      if (event.origin !== window.location.origin && !isTrustedPopup) return;
      const data = event.data || {};
      if (data.source !== SCREEN_ASSISTANT_MESSAGE_SOURCE) return;

      if (data.type === "ready") {
        syncScreenAssistantPopup();
        return;
      }

      if (data.type === "ask") {
        const prompt = typeof data.prompt === "string" ? data.prompt : "";
        setScreenPrompt(prompt);
        askAboutSharedScreen(prompt);
        return;
      }

      if (data.type === "stop") {
        stopScreenShare("Screen sharing stopped.");
        return;
      }

      if (data.type === "close" || data.type === "popupClosed") {
        screenPopupRef.current = null;
        setShowScreenAssistant(false);
      }
    };

    window.addEventListener("message", handleScreenPopupMessage);
    return () => window.removeEventListener("message", handleScreenPopupMessage);
  });

  useEffect(() => {
    const popup = screenPopupRef.current;
    if (!popup || popup.closed) {
      screenPopupRef.current = null;
      return;
    }

    popup.postMessage(
      {
        source: SCREEN_ASSISTANT_MESSAGE_SOURCE,
        type: "state",
        screenShareStatus,
        screenPrompt,
        screenAnswer,
        loading,
        visionCooldown,
      },
      window.location.origin
    );
  }, [screenShareStatus, screenPrompt, screenAnswer, loading, visionCooldown]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const sharedConversation = parseSharedConversation();
      const storedCooldown = window.localStorage.getItem(STORAGE_KEYS.cooldownUntil);
      const storedVisionCooldown = window.localStorage.getItem(
        STORAGE_KEYS.visionCooldownUntil
      );

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
        setDraftsByConversationId(storedState?.draftsByConversationId || {});
        setUsageTimestamps(storedState?.usageTimestamps || []);
        setRequestHistory(storedState?.requestHistory || []);

        if (storedCooldown) {
          const remaining = Math.max(
            0,
            Math.ceil((Number(storedCooldown) - Date.now()) / 1000)
          );
          setCooldown(remaining);
        }

        if (storedVisionCooldown) {
          const remaining = Math.max(
            0,
            Math.ceil((Number(storedVisionCooldown) - Date.now()) / 1000)
          );
          setVisionCooldown(remaining);
        }

        if (sharedConversation) {
          setBanner({
            tone: "info",
            message: "Shared conversation added to this browser's workspace.",
          });
        } else if (!syncReadiness.ready) {
          setBanner({
            tone: "info",
            message:
              "Private by default: chats stay on this browser unless you export or share one.",
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
                remoteConversations.length > 0 ? "Synced" : "Cloud ready"
              );
            } else {
              setSyncStatus("Sync setup pending");
            }
          } catch {
            setSyncStatus("Sync unavailable");
          }
        }
      } catch {
        const freshConversation = sharedConversation || createConversation();
        setConversations([freshConversation]);
        setActiveConversationId(freshConversation.id);
        setDraftsByConversationId({});
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
      draftsByConversationId,
      usageTimestamps,
      requestHistory,
    }).catch(() => {
      setBanner({
        tone: "error",
        message: "Unable to save workspace state in this browser.",
      });
    });
  }, [
    conversations,
    activeConversationId,
    draftsByConversationId,
    usageTimestamps,
    requestHistory,
    historyReady,
  ]);

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
    if (!activeConversationId) return;

    const nextDraft = draftsByConversationIdRef.current[activeConversationId];
    isRestoringDraftRef.current = true;
    setInput(nextDraft?.input || "");
    setPendingAttachments(nextDraft?.attachments || []);

    const timer = setTimeout(() => {
      isRestoringDraftRef.current = false;
    }, 0);

    return () => clearTimeout(timer);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || isRestoringDraftRef.current) return;

    setDraftsByConversationId((current) => {
      const existingDraft = current[activeConversationId];
      const nextInput = input;
      const nextAttachments = pendingAttachments;
      const hasDraft = nextInput.trim().length > 0 || nextAttachments.length > 0;

      if (!hasDraft) {
        if (!existingDraft) return current;
        const nextState = { ...current };
        delete nextState[activeConversationId];
        return nextState;
      }

      if (
        existingDraft?.input === nextInput &&
        areDraftAttachmentsEqual(existingDraft?.attachments || [], nextAttachments)
      ) {
        return current;
      }

      return {
        ...current,
        [activeConversationId]: {
          input: nextInput,
          attachments: nextAttachments,
        },
      };
    });
  }, [activeConversationId, input, pendingAttachments]);

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
    if (visionCooldown <= 0) {
      window.localStorage.removeItem(STORAGE_KEYS.visionCooldownUntil);
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.visionCooldownUntil,
      String(Date.now() + visionCooldown * 1000)
    );

    const timer = setInterval(() => {
      setVisionCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [visionCooldown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!copiedId) return;
    const timeout = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(timeout);
  }, [copiedId]);

  useEffect(() => {
    if (!showPresetMenu) return;

    function handlePointerDown(event) {
      if (!presetMenuRef.current?.contains(event.target)) {
        setShowPresetMenu(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showPresetMenu]);

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

  async function requestAssistantReply({
    conversationSnapshot,
    requestMessages,
    visibleMessages,
    nextTitle,
    onStream,
    onDone,
    onError,
  }) {
    const streamingMessageId = crypto.randomUUID();
    const apiMessages = prepareMessagesForRequest(requestMessages);
    const requestHasImage = messagesIncludeImage(requestMessages);
    const requestContext = {
      researchEnabled: Boolean(conversationSnapshot.researchMode),
      attachmentCount:
        requestMessages[requestMessages.length - 1]?.attachments?.length || 0,
      customInstructions: conversationHasCustomInstructions(conversationSnapshot),
      modelLabel: getModelDisplayName(conversationSnapshot.model),
      contextMessageCount: apiMessages.length,
    };
    const assistantPlaceholder = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      requestContext,
    };
    const startedAt = Date.now();

    updateConversation(conversationSnapshot.id, () => ({
      messages: [...visibleMessages, assistantPlaceholder],
      title: nextTitle,
    }));

    setLoading(true);
    setBanner(null);

    try {
      const response = await fetch(getApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          messages: apiMessages,
          model: conversationSnapshot.model,
          systemPrompt: conversationSnapshot.systemPrompt,
          researchMode: conversationSnapshot.researchMode,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json();
        let errorMessage = data.error || "Request failed.";
        const isVisionLimit = Boolean(data.visionRateLimited || requestHasImage);

        if (data.isRateLimited && data.retryAfter) {
          const seconds = getRetrySeconds(data.retryAfter);
          const waitText = formatWaitDuration(seconds);
          if (isVisionLimit) {
            setVisionCooldown(seconds);
            errorMessage = `Image analysis is cooling down. Wait ${waitText}, then press Retry once. Text-only questions can still work.`;
          } else {
            setCooldown(seconds);
            errorMessage = data.providerRateLimited
              ? `ShuttleAI is cooling down. Wait ${waitText}, then press Retry once.`
              : data.error || `Retry in ${waitText}.`;
          }
        } else if (data.retryAfter) {
          const seconds = getRetrySeconds(data.retryAfter);
          const waitText = formatWaitDuration(seconds);
          if (isVisionLimit) {
            setVisionCooldown(seconds);
            errorMessage = `Image analysis is cooling down. Wait ${waitText}, then press Retry once.`;
          } else {
            setCooldown(seconds);
            errorMessage = `Retry in ${waitText}.`;
          }
        }

        recordRequest({
          at: Date.now(),
          latencyMs: Date.now() - startedAt,
          status: data.isRateLimited ? "rate_limited" : "error",
          model: conversationSnapshot.model,
        });

        const messagesWithoutOldCooldown = data.providerRateLimited
          ? visibleMessages.filter((message) => !isProviderCooldownMessage(message))
          : visibleMessages;

        updateConversation(conversationSnapshot.id, () => ({
          title: nextTitle,
          messages: [
            ...messagesWithoutOldCooldown,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: errorMessage,
              requestContext: {
                ...requestContext,
                errorType: data.providerRateLimited
                  ? isVisionLimit
                    ? "vision_cooldown"
                    : "provider_cooldown"
                  : "request_error",
              },
            },
          ],
        }));
        onError?.(errorMessage);
        setBanner({ tone: "error", message: errorMessage });
        return;
      }

      setUsageTimestamps((current) =>
        [...current, Date.now()].filter((timestamp) => Date.now() - timestamp < 60000)
      );

      const routedModel = response.headers.get("x-vanta-model");
      const routedStrategy = response.headers.get("x-vanta-model-strategy");
      const contextMessageCount = Number(
        response.headers.get("x-vanta-context-messages") || apiMessages.length
      );
      if (routedModel || routedStrategy) {
        const routedLabel =
          routedStrategy === "auto-fast"
            ? "Auto: fast model"
            : routedStrategy === "auto-smart"
              ? "Auto: smart model"
              : routedStrategy === "fallback"
                ? `Fallback: ${getModelDisplayName(routedModel)}`
                : getModelDisplayName(routedModel || conversationSnapshot.model);

        updateConversation(conversationSnapshot.id, (conversation) => ({
          messages: conversation.messages.map((message) =>
            message.id === streamingMessageId
              ? {
                  ...message,
                  requestContext: {
                    ...message.requestContext,
                    modelLabel: routedLabel,
                    contextMessageCount,
                  },
                }
              : message
          ),
        }));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";
      let lastRenderAt = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamedText += decoder.decode(value, { stream: true });
        if (Date.now() - lastRenderAt < 60) continue;
        lastRenderAt = Date.now();
        updateConversation(conversationSnapshot.id, (conversation) => ({
          messages: conversation.messages.map((message) =>
            message.id === streamingMessageId
              ? { ...message, content: streamedText }
              : message
          ),
        }));
        onStream?.(streamedText);
      }

      const finalText = streamedText.trim() || "No response returned.";
      updateConversation(conversationSnapshot.id, (conversation) => ({
        messages: conversation.messages.map((message) =>
          message.id === streamingMessageId
            ? {
                ...message,
                content: finalText,
              }
            : message
        ),
      }));
      onDone?.(finalText);

      recordRequest({
        at: Date.now(),
        latencyMs: Date.now() - startedAt,
        status: "success",
        model: conversationSnapshot.model,
      });
    } catch {
      const errorMessage = "Connection error. Please try again.";
      updateConversation(conversationSnapshot.id, () => ({
        title: nextTitle,
        messages: [
          ...visibleMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: errorMessage,
            requestContext,
          },
        ],
      }));
      recordRequest({
        at: Date.now(),
        latencyMs: Date.now() - startedAt,
        status: "error",
        model: conversationSnapshot.model,
      });
      onError?.(errorMessage);
      setBanner({ tone: "error", message: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  function clearConversationDraft(conversationId) {
    setDraftsByConversationId((current) => {
      if (!current[conversationId]) return current;
      const nextState = { ...current };
      delete nextState[conversationId];
      return nextState;
    });
  }

  async function sendMessage() {
    const hasPendingImage = pendingAttachments.some((attachment) => attachment.kind === "image");

    if (
      (!input.trim() && pendingAttachments.length === 0) ||
      loading ||
      (!hasPendingImage && cooldown > 0) ||
      !activeConversation
    ) {
      return;
    }

    if (hasPendingImage && visionCooldown > 0) {
      setBanner({
        tone: "info",
        message: `Image analysis is cooling down for ${formatWaitDuration(visionCooldown)}. You can remove the image and send text-only while you wait.`,
      });
      return;
    }

    const conversationSnapshot = activeConversation;
    const normalizedInput = normalizeComposerInput(input);
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: normalizedInput || "Uploaded files",
      attachments: pendingAttachments,
    };
    const hasMeaningfulTitle =
      conversationSnapshot.title && conversationSnapshot.title !== "New conversation";
    const nextTitle = hasMeaningfulTitle
      ? conversationSnapshot.title
      : createTitleFromMessage(userMessage.content);
    const nextMessages = [...conversationSnapshot.messages, userMessage];

    setInput("");
    setPendingAttachments([]);
    clearConversationDraft(conversationSnapshot.id);

    await requestAssistantReply({
      conversationSnapshot,
      requestMessages: nextMessages,
      visibleMessages: nextMessages,
      nextTitle,
    });
  }

  async function regenerateLatestResponse() {
    if (loading || !activeConversation) return;

    const context = getLatestRetryContext(activeConversation.messages);
    if (!context) {
      setBanner({
        tone: "error",
        message: "There isn't a user prompt to regenerate yet.",
      });
      return;
    }

    const retryUsesImage = messagesIncludeImage(context.requestMessages);
    if (!retryUsesImage && cooldown > 0) return;

    if (retryUsesImage && visionCooldown > 0) {
      setBanner({
        tone: "info",
        message: `Image analysis is cooling down for ${formatWaitDuration(visionCooldown)}. Wait for the timer, then press Retry once.`,
      });
      return;
    }

    await requestAssistantReply({
      conversationSnapshot: activeConversation,
      requestMessages: context.requestMessages,
      visibleMessages: context.requestMessages,
      nextTitle: activeConversation.title,
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function startEditingMessage(message) {
    setEditingMessageId(message.id);
    setEditDraft(getMessageContentText(message));
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  function saveEditedMessage(messageId) {
    const nextValue = editDraft.trim();
    if (!nextValue) return;

    updateMessage(messageId, () => ({ content: nextValue }));
    setBanner({
      tone: "info",
      message: "Message updated. Use regenerate when you want a fresh answer.",
    });
    cancelEditingMessage();
  }

  function toggleMessagePin(messageId) {
    updateMessage(messageId, (message) => ({ pinned: !message.pinned }));
  }

  function toggleMessageFavorite(messageId) {
    updateMessage(messageId, (message) => ({ favorite: !message.favorite }));
  }

  function setMessageFeedback(messageId, feedback) {
    updateMessage(messageId, (message) => ({
      feedback: message.feedback === feedback ? null : feedback,
    }));
  }

  function createNewConversation() {
    const newConversation = createConversation(activeModel);
    setInput("");
    setPendingAttachments([]);
    setShowPromptEditor(false);
    setShowPresetMenu(false);
    setShowMobileConversations(false);
    setConversationSearch("");
    startTransition(() => {
      setConversations((current) => [newConversation, ...current]);
      setActiveConversationId(newConversation.id);
    });
  }

  function resetConversation() {
    if (!activeConversation) return;

    clearConversationDraft(activeConversation.id);

    updateConversation(activeConversation.id, () => ({
      title: "New conversation",
      messages: [DEFAULT_ASSISTANT_MESSAGE],
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      researchMode: false,
    }));
    setInput("");
    setPendingAttachments([]);
    setShowPresetMenu(false);
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

    clearConversationDraft(pendingDeleteConversationId);

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

  function selectConversation(nextConversationId) {
    setPendingAttachments([]);
    setShowPromptEditor(false);
    setShowPresetMenu(false);
    setShowMobileConversations(false);
    startTransition(() => {
      setActiveConversationId(nextConversationId);
    });
  }

  function toggleResearchMode() {
    if (!activeConversation) return;

    updateConversation(activeConversation.id, (conversation) => ({
      researchMode: !conversation.researchMode,
    }));
    setBanner({
      tone: "info",
      message: researchMode
        ? "Web context turned off. Replies will stay focused on what you provide here."
        : "Web context turned on. Vanta can now pull outside sources and citations for this conversation.",
    });
  }

  function updateSystemPrompt(nextPrompt) {
    if (!activeConversation) return;
    updateConversation(activeConversation.id, () => ({ systemPrompt: nextPrompt }));
  }

  function applyPreset(value) {
    setInput((current) => (current ? `${value}\n\n${current}` : value));
    setShowPresetMenu(false);
  }

  function applySchoolSupportOption(option) {
    setInput(option.prompt);
    setShowPresetMenu(false);

    if (activeConversation) {
      updateConversation(activeConversation.id, () => ({
        systemPrompt: buildSchoolSupportPrompt(option),
      }));
    }

    setBanner({
      tone: "info",
      message: `${option.title} mode is ready. Paste the question and your attempt so Vanta can check the reasoning.`,
    });
  }

  function removeAttachment(id) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== id)
    );
  }

  async function copyMessage(content, id) {
    try {
      await navigator.clipboard.writeText(typeof content === "string" ? content : "");
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
            "Image-heavy conversations are too large for local share links right now.",
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
      return `${speaker}\n${getMessageContentText(message)}\n${
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
    (message) => message.role === "assistant" && !getMessageContentText(message).trim()
  );
  const hasPendingImage = pendingAttachments.some((attachment) => attachment.kind === "image");
  const buttonLabel =
    hasPendingImage && visionCooldown > 0
      ? `Image wait ${visionCooldown}s`
      : !hasPendingImage && cooldown > 0
        ? `Wait ${cooldown}s`
        : loading
          ? "Working..."
          : "Send";

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#0b0b0f] text-white lg:h-auto lg:min-h-screen lg:overflow-visible">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden lg:min-h-screen lg:flex-row lg:overflow-visible">
        <aside className="hidden w-[300px] shrink-0 border-r border-white/6 bg-[#0f1014] lg:flex lg:flex-col">
          <div className="border-b border-white/6 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/16 bg-violet-500/10 text-sm font-semibold text-violet-100">
                  V
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Vanta</p>
                  <p className="text-xs text-white/38">Focused AI workspace</p>
                </div>
              </div>
              <button
                onClick={createNewConversation}
                className="rounded-[0.9rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-white/78 transition hover:bg-white/[0.08]"
              >
                New chat
              </button>
            </div>
            <input
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search conversations"
              className="mt-4 w-full rounded-[0.95rem] border border-white/8 bg-[#14151b] px-4 py-3 text-sm text-white outline-none placeholder:text-white/24"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {conversationSections.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/40">
                {deferredConversationSearch.trim()
                  ? "Nothing matches that search yet."
                  : "No conversations yet."}
              </div>
            ) : (
              <div className="space-y-5">
                {conversationSections.map((section) => (
                  <ConversationSection
                    key={section.title}
                    title={section.title}
                    description={section.description}
                    conversations={section.conversations}
                    activeConversationId={activeConversationId}
                    onSelect={selectConversation}
                    onRename={renameConversation}
                    onDelete={deleteConversation}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/6 px-4 py-4 text-sm leading-6 text-white/42">
            <p className="font-medium text-white/72">Private by default</p>
            <p className="mt-2">
              Conversations stay in this browser unless you export or share one
              yourself.
            </p>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-screen">
          <header className="shrink-0 border-b border-white/6 bg-[#0f1014]/95 px-3 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/16 bg-violet-500/10 text-sm font-semibold text-violet-100">
                  V
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Vanta</p>
                  <p className="text-xs text-white/38">Focused AI workspace</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMobileConversations((current) => !current)}
                  className={`rounded-[0.9rem] border px-3 py-2 text-sm transition ${
                    showMobileConversations
                      ? "border-violet-300/20 bg-violet-500/12 text-violet-100"
                      : "border-white/8 bg-white/[0.04] text-white/78 hover:bg-white/[0.08]"
                  }`}
                >
                  Chats
                </button>
                <button
                  onClick={createNewConversation}
                  className="rounded-[0.9rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-white/78 transition hover:bg-white/[0.08]"
                >
                  New
                </button>
              </div>
            </div>

            {showMobileConversations && (
              <div className="mt-3 max-h-[48dvh] overflow-y-auto rounded-[1rem] border border-white/8 bg-[#0b0c11] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
                <input
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="Search conversations"
                  className="w-full rounded-[0.95rem] border border-white/8 bg-[#14151b] px-4 py-3 text-base text-white outline-none placeholder:text-white/24"
                />
                <div className="mt-4">
                  {conversationSections.length === 0 ? (
                    <div className="rounded-[1rem] border border-dashed border-white/10 px-4 py-4 text-sm text-white/40">
                      {deferredConversationSearch.trim()
                        ? "Nothing matches that search yet."
                        : "No conversations yet."}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {conversationSections.map((section) => (
                        <ConversationSection
                          key={section.title}
                          title={section.title}
                          description={section.description}
                          conversations={section.conversations}
                          activeConversationId={activeConversationId}
                          onSelect={selectConversation}
                          onRename={renameConversation}
                          onDelete={deleteConversation}
                          mobile
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2 sm:px-6 lg:overflow-visible lg:px-8 lg:py-6">
            {banner && (
              <div
                className={`mb-4 rounded-[0.95rem] border px-4 py-3 text-sm ${
                  banner.tone === "error"
                    ? "border-red-400/18 bg-red-500/8 text-red-200"
                    : banner.tone === "success"
                      ? "border-emerald-400/18 bg-emerald-500/8 text-emerald-200"
                      : "border-violet-400/18 bg-violet-500/8 text-violet-200"
                }`}
              >
                {banner.message}
              </div>
            )}

            <section
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col overflow-hidden rounded-[1.15rem] border bg-[#111217]/94 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.24)] sm:rounded-[1.55rem] sm:p-5 lg:overflow-visible ${
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
                cancelEditingMessage={cancelEditingMessage}
                buttonLabel={buttonLabel}
                changeModel={changeModel}
                cooldown={cooldown}
                visionCooldown={visionCooldown}
                copyMessage={copyMessage}
                editDraft={editDraft}
                editingMessageId={editingMessageId}
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
                latestRetryableAssistantId={latestRetryableAssistantId}
                removeAttachment={removeAttachment}
                researchMode={researchMode}
                regenerateLatestResponse={regenerateLatestResponse}
                saveEditedMessage={saveEditedMessage}
                setInput={setInput}
                setEditDraft={setEditDraft}
                setMessageFeedback={setMessageFeedback}
                setShowPromptEditor={setShowPromptEditor}
                shareConversation={shareConversation}
                showPromptEditor={showPromptEditor}
                startEditingMessage={startEditingMessage}
                toggleResearchMode={toggleResearchMode}
                toggleMessageFavorite={toggleMessageFavorite}
                toggleMessagePin={toggleMessagePin}
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
                applySchoolSupportOption={applySchoolSupportOption}
                schoolSupportOptions={SCHOOL_SUPPORT_OPTIONS}
                showPresetMenu={showPresetMenu}
                setShowPresetMenu={setShowPresetMenu}
                presetMenuRef={presetMenuRef}
                screenShareStatus={screenShareStatus}
                startScreenShare={startScreenShare}
                openScreenAssistantWindow={openScreenAssistantWindow}
                setShowScreenAssistant={setShowScreenAssistant}
              />
            </section>
          </div>
        </div>
      </div>

      <video
        ref={screenVideoRef}
        className="pointer-events-none fixed h-px w-px opacity-0"
        muted
        playsInline
      />

      {showScreenAssistant && (
        <div className="fixed bottom-4 left-4 right-4 z-40 rounded-[1.15rem] border border-violet-300/18 bg-[#070a13]/96 p-3 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:bottom-auto sm:left-auto sm:right-5 sm:top-5 sm:w-[430px]">
          <div className="mb-2 flex items-center justify-between gap-3 rounded-[0.85rem] border border-white/8 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/62">
              Vanta screen
            </p>
            <div className="flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-400/8 px-2.5 py-1 text-xs text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Sharing active
            </div>
          </div>

          <textarea
            value={screenPrompt}
            onChange={(event) => setScreenPrompt(event.target.value)}
            rows={3}
            placeholder="Ask about your current screen..."
            className="min-h-[86px] w-full resize-none rounded-[0.9rem] border border-white/10 bg-[#0d111d] px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-violet-300/30"
          />

          <div className="mt-3 max-h-56 overflow-y-auto rounded-[0.95rem] border border-white/8 bg-black/20 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">
                Vanta says
              </p>
              {loading && (
                <span className="rounded-full border border-violet-300/16 bg-violet-400/8 px-2 py-1 text-[11px] text-violet-100">
                  generating
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-white/82">
              {screenAnswer}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => stopScreenShare("Screen sharing stopped.")}
              className="rounded-[0.75rem] border border-white/10 px-3 py-2 text-sm text-white/78 transition hover:bg-white/[0.06]"
            >
              Stop sharing
            </button>
            <button
              onClick={() => askAboutSharedScreen()}
              disabled={loading || visionCooldown > 0}
              className="rounded-[0.75rem] bg-violet-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/32"
            >
              {visionCooldown > 0
                ? `Image wait ${visionCooldown}s`
                : loading
                  ? "Working..."
                  : "Ask"}
            </button>
            <button
              onClick={() => setShowScreenAssistant(false)}
              className="ml-auto rounded-[0.75rem] border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              Close
            </button>
          </div>
        </div>
      )}

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
  cancelEditingMessage,
  buttonLabel,
  changeModel,
  cooldown,
  visionCooldown,
  copyMessage,
  editDraft,
  editingMessageId,
  exportConversation,
  fileInputRef,
  hasCustomPrompt,
  hasStreamingPlaceholder,
  input,
  isListening,
  latestRetryableAssistantId,
  loading,
  messages,
  messagesEndRef,
  pendingAttachments,
  removeAttachment,
  researchMode,
  regenerateLatestResponse,
  saveEditedMessage,
  setInput,
  setEditDraft,
  setMessageFeedback,
  setShowPromptEditor,
  shareConversation,
  showPromptEditor,
  startEditingMessage,
  toggleResearchMode,
  toggleMessageFavorite,
  toggleMessagePin,
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
  applySchoolSupportOption,
  schoolSupportOptions,
  showPresetMenu,
  setShowPresetMenu,
  presetMenuRef,
  screenShareStatus,
  startScreenShare,
  openScreenAssistantWindow,
  setShowScreenAssistant,
}) {
  const hasUserMessages = messages.some((message) => message.role === "user");
  const screenSharingActive = screenShareStatus === "active";
  const screenShareLabel =
    screenShareStatus === "starting"
      ? "Starting..."
      : screenSharingActive
        ? "Screen panel"
        : "Share screen";
  const latestRetryContext = getLatestRetryContext(messages);
  const latestRetryUsesImage = latestRetryContext
    ? messagesIncludeImage(latestRetryContext.requestMessages)
    : false;
  const retryCooldownLabel = latestRetryUsesImage
    ? visionCooldown > 0
      ? `Image wait ${visionCooldown}s`
      : null
    : cooldown > 0
      ? `Wait ${cooldown}s`
      : null;
  const retryDisabled =
    !latestRetryableAssistantId || loading || Boolean(retryCooldownLabel);
  const hasPendingImage = pendingAttachments.some((attachment) => attachment.kind === "image");

  return (
    <>
      <div className="mb-3 shrink-0 border-b border-white/6 pb-3 sm:mb-4 sm:pb-4">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/28">
              Vanta
            </p>
            <h2 className="mt-1.5 text-[1.55rem] font-semibold tracking-[-0.04em] text-white sm:mt-2 sm:text-[1.9rem]">
              {activeConversation?.title || "New chat"}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/42 sm:mt-2">
              {hasUserMessages
                ? "Continue the thread, switch tools only when needed, and keep the prompt focused on one task at a time."
                : "Ask a question, drop in a file, or paste a screenshot to start the conversation."}
            </p>
          </div>

          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 pr-1 sm:mx-0 sm:gap-2.5 lg:max-w-[560px] lg:flex-wrap lg:justify-end lg:overflow-visible">
            <select
              value={activeModel}
              onChange={(event) => changeModel(event.target.value)}
              className="shrink-0 rounded-[0.9rem] border border-white/8 bg-[#16171d] px-3 py-2.5 text-base text-white/72 outline-none sm:text-sm"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={toggleResearchMode}
              className={`shrink-0 rounded-[0.9rem] border px-3 py-2.5 text-sm transition ${
                researchMode
                  ? "border-violet-400/22 bg-violet-500/10 text-violet-100"
                  : "border-white/8 bg-[#16171d] text-white/70 hover:bg-white/[0.05]"
                }`}
            >
              {researchMode ? "Web context on" : "Web context off"}
            </button>
            <button
              onClick={() => setShowPromptEditor((current) => !current)}
              className={`shrink-0 rounded-[0.9rem] border px-3 py-2.5 text-sm transition ${
                showPromptEditor
                  ? "border-violet-400/22 bg-violet-500/10 text-violet-100"
                  : "border-white/8 bg-[#16171d] text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              {showPromptEditor ? "Hide instructions" : "Instructions"}
            </button>
            <button
              onClick={shareConversation}
              className="shrink-0 rounded-[0.9rem] border border-white/8 bg-[#16171d] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.05]"
            >
              Share
            </button>
            <button
              onClick={exportConversation}
              className="shrink-0 rounded-[0.9rem] border border-white/8 bg-[#16171d] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.05]"
            >
              Export
            </button>
            <button
              onClick={resetConversation}
              className="shrink-0 rounded-[0.9rem] border border-white/8 bg-[#16171d] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.05]"
            >
              Reset
            </button>
            <button
              onClick={regenerateLatestResponse}
              disabled={retryDisabled}
              className="shrink-0 rounded-[0.9rem] border border-white/8 bg-[#16171d] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:text-white/28"
            >
              Regenerate
            </button>
            {retryCooldownLabel && (
              <div className="shrink-0 rounded-[0.9rem] border border-violet-400/18 bg-violet-500/10 px-3 py-2.5 text-sm text-violet-200">
                {retryCooldownLabel}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 hidden flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/38 sm:flex">
          <InlineStatus
            label="History"
            value="Saved only in this browser."
          />
          <InlineStatus
            label="Research"
            value={
              researchMode
                ? "Web context is active for this conversation."
                : "Web context is off."
            }
          />
          <InlineStatus
            label="Instructions"
            value={
              hasCustomPrompt
                ? "Custom instructions are shaping replies."
                : "Default instructions are active."
            }
          />
        </div>

        {showPromptEditor && (
          <div className="mt-4 rounded-[1rem] border border-white/8 bg-[#15161c] p-3 sm:p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/35">
              Conversation instructions
            </p>
            <p className="mt-2 text-sm leading-6 text-white/42">
              These instructions only affect this conversation and stay with it in this browser.
            </p>
            <textarea
              value={activeSystemPrompt}
              onChange={(event) => updateSystemPrompt(event.target.value)}
              rows={5}
              className="mt-3 w-full resize-none rounded-[1rem] border border-white/10 bg-transparent px-3 py-3 text-base leading-6 text-white/78 outline-none placeholder:text-white/25 sm:text-sm"
            />
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-nowrap items-center gap-x-2 overflow-x-auto pb-1 text-xs text-white/32 sm:mb-4 sm:flex-wrap sm:gap-x-3 sm:overflow-visible sm:pb-0">
        <span>{usageCount}/2 requests used in the last minute</span>
        <span className="text-white/18">|</span>
        <span>Shift+Enter adds a new line</span>
        <span className="text-white/18">|</span>
        <span>{voiceSupported ? "Voice input is available" : "Voice input is unavailable"}</span>
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

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.05rem] border border-white/6 bg-[#0d0e13] p-3 sm:rounded-[1.35rem] sm:p-5 lg:min-h-[460px]">
        <div className="space-y-4">
          {!hasUserMessages && (
            <div className="mx-auto max-w-3xl rounded-[1.05rem] border border-white/6 bg-[#14151b] p-4 sm:rounded-[1.2rem] sm:p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/34">
                Start here
              </p>
              <h3 className="mt-3 text-[1.6rem] font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">
                How can Vanta help?
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/46">
                Ask a question, drop in a file, or paste a screenshot. Vanta keeps
                history in this browser only, so the workspace stays simple and
                private by default.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter.title}
                    onClick={() => setInput(starter.prompt)}
                    className="rounded-[1rem] border border-white/8 bg-[#101117] px-4 py-4 text-left text-sm leading-6 text-white/68 transition hover:border-white/14 hover:bg-white/[0.04] hover:text-white"
                  >
                    <span className="block text-white">{starter.title}</span>
                    <span className="mt-2 block text-white/46">{starter.hint}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-[1rem] border border-violet-400/12 bg-violet-500/[0.045] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-100/45">
                      Check my work
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                      Choose a focused mode for Reading Plus, i-Ready, or IXL.
                      Vanta can review your attempt, explain the reasoning, and
                      show how to handle the next one.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {schoolSupportOptions.map((option) => (
                    <button
                      key={option.title}
                      onClick={() => applySchoolSupportOption(option)}
                      className="rounded-[0.95rem] border border-white/8 bg-[#101117] px-4 py-4 text-left transition hover:border-violet-300/20 hover:bg-violet-500/[0.06]"
                    >
                      <span className="block text-sm font-medium text-white">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs text-violet-100/45">
                        {option.apps}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatusNote label="Private by default" value="Chats stay on this device unless you export or share one yourself." />
                <StatusNote label="Web context" value="Leave it off for direct help. Turn it on only when you want outside sources." />
                <StatusNote label="Input options" value="Type, attach a file, paste a screenshot, or use voice input in the composer below." />
              </div>
            </div>
          )}

          {messages.map((message, index) => {
            if (!hasUserMessages && message.id === DEFAULT_ASSISTANT_MESSAGE.id) {
              return null;
            }

            const messageText = getMessageContentText(message);
            const showStreamingDots =
              loading && message.role === "assistant" && !messageText.trim();
            const isEditing = editingMessageId === message.id;
            const isRetryableAssistant =
              message.role === "assistant" &&
              message.id === latestRetryableAssistantId &&
              !showStreamingDots;
            const assistantContextBadges = getAssistantContextBadges(message);

            return (
              <div
                key={message.id || index}
                className={`max-w-[92%] rounded-[1.05rem] px-4 py-3 sm:max-w-[85%] sm:rounded-[1.2rem] sm:px-5 sm:py-4 ${
                  message.role === "user"
                    ? "ml-auto border border-violet-300/14 bg-gradient-to-br from-violet-700/88 via-violet-600/76 to-fuchsia-600/62 text-white shadow-[0_10px_24px_rgba(76,29,149,0.16)]"
                    : "border border-white/6 bg-[#15161c] text-white"
                } ${message.pinned ? "ring-1 ring-violet-300/30" : ""} ${
                  message.favorite ? "shadow-[0_12px_32px_rgba(168,85,247,0.14)]" : ""
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                      {message.role === "user" ? "You" : "Vanta"}
                    </p>
                    {message.pinned && (
                      <span className="rounded-full border border-violet-300/20 bg-violet-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-violet-100/90">
                        Pinned
                      </span>
                    )}
                    {message.favorite && (
                      <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-fuchsia-100/90">
                        Saved
                      </span>
                    )}
                    {message.feedback === "up" && (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-100/90">
                        Helpful
                      </span>
                    )}
                    {message.feedback === "down" && (
                      <span className="rounded-full border border-amber-300/20 bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100/90">
                        Needs work
                      </span>
                    )}
                  </div>
                  {messageText.trim() && (
                    <button
                      onClick={() => copyMessage(messageText, message.id || index)}
                      className="text-xs text-white/40 transition hover:text-white/75"
                    >
                      Copy
                    </button>
                  )}
                </div>
                {assistantContextBadges.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {assistantContextBadges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/52"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
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
                ) : isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelEditingMessage();
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.preventDefault();
                          saveEditedMessage(message.id);
                        }
                      }}
                      rows={4}
                      className="w-full resize-none rounded-[1rem] border border-white/10 bg-black/15 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => saveEditedMessage(message.id)}
                        className="rounded-[0.85rem] border border-white/8 bg-white/[0.06] px-3 py-2 text-xs text-white/80 transition hover:bg-white/[0.1]"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditingMessage}
                        className="rounded-[0.85rem] border border-white/8 bg-transparent px-3 py-2 text-xs text-white/55 transition hover:bg-white/[0.06]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <MessageBody
                    content={messageText}
                    user={message.role === "user"}
                    attachments={message.attachments}
                  />
                )}
                {!showStreamingDots && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {message.role === "user" && !isEditing && (
                      <button
                        onClick={() => startEditingMessage(message)}
                        className="rounded-[0.75rem] border border-white/8 px-2.5 py-1.5 text-white/58 transition hover:bg-white/[0.06] hover:text-white/78"
                      >
                        Edit
                      </button>
                    )}
                    {isRetryableAssistant && (
                      <button
                        onClick={regenerateLatestResponse}
                        disabled={loading || Boolean(retryCooldownLabel)}
                        className="rounded-[0.75rem] border border-white/8 px-2.5 py-1.5 text-white/58 transition hover:bg-white/[0.06] hover:text-white/78 disabled:cursor-not-allowed disabled:text-white/28"
                      >
                        {retryCooldownLabel || "Retry"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleMessagePin(message.id)}
                      className={`rounded-[0.75rem] border px-2.5 py-1.5 transition ${
                        message.pinned
                          ? "border-violet-300/20 bg-violet-500/12 text-violet-100"
                          : "border-white/8 text-white/58 hover:bg-white/[0.06] hover:text-white/78"
                      }`}
                    >
                      {message.pinned ? "Pinned" : "Pin"}
                    </button>
                    <button
                      onClick={() => toggleMessageFavorite(message.id)}
                      className={`rounded-[0.75rem] border px-2.5 py-1.5 transition ${
                        message.favorite
                          ? "border-violet-300/20 bg-violet-500/12 text-violet-100"
                          : "border-white/8 text-white/58 hover:bg-white/[0.06] hover:text-white/78"
                      }`}
                    >
                      {message.favorite ? "Saved" : "Favorite"}
                    </button>
                    {message.role === "assistant" && (
                      <>
                        <button
                          onClick={() => setMessageFeedback(message.id, "up")}
                          className={`rounded-[0.75rem] border px-2.5 py-1.5 transition ${
                            message.feedback === "up"
                              ? "border-emerald-300/20 bg-emerald-500/12 text-emerald-100"
                              : "border-white/8 text-white/58 hover:bg-white/[0.06] hover:text-white/78"
                          }`}
                        >
                          Helpful
                        </button>
                        <button
                          onClick={() => setMessageFeedback(message.id, "down")}
                          className={`rounded-[0.75rem] border px-2.5 py-1.5 transition ${
                            message.feedback === "down"
                              ? "border-amber-300/20 bg-amber-500/12 text-amber-100"
                              : "border-white/8 text-white/58 hover:bg-white/[0.06] hover:text-white/78"
                          }`}
                        >
                          Needs work
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && !hasStreamingPlaceholder && (
            <div className="max-w-[92%] rounded-[1.05rem] border border-white/6 bg-white/[0.04] px-4 py-3 text-white sm:max-w-[85%] sm:rounded-[1.2rem] sm:px-5 sm:py-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                Vanta
              </p>
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
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="mt-3 shrink-0 rounded-[1rem] border border-white/6 bg-[#101116] p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] sm:mt-4 sm:rounded-[1.2rem] sm:p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={3}
          placeholder="Type your message, paste a screenshot, or drag files in..."
          className="min-h-[84px] w-full resize-none rounded-[0.9rem] border border-white/8 bg-[#0c0d12] px-4 py-3 text-base text-white outline-none placeholder:text-white/28 focus:border-violet-400/24 sm:min-h-[118px] sm:rounded-[1rem] sm:px-5 sm:py-4"
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={presetMenuRef}>
              <button
                onClick={() => setShowPresetMenu((current) => !current)}
                className={`rounded-[0.82rem] border px-3 py-2 text-sm transition ${
                  showPresetMenu
                    ? "border-violet-400/20 bg-violet-500/10 text-violet-100"
                    : "border-white/8 bg-transparent text-white/62 hover:border-white/14 hover:bg-white/[0.04] hover:text-white/82"
                }`}
              >
                Quick actions
              </button>
              {showPresetMenu && (
                <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(88vw,280px)] rounded-[1rem] border border-white/8 bg-[#12091d] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.32)] sm:w-[250px]">
                  <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/30">
                    Insert prompt
                  </p>
                  <div className="space-y-1">
                    {PROMPT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset.value)}
                        className="flex w-full items-center justify-between rounded-[0.8rem] px-3 py-2 text-left text-sm text-white/66 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <span>{preset.label}</span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-white/24">
                          /{preset.label.toLowerCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-white/8 pt-2">
                    <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-violet-100/38">
                      Check my work
                    </p>
                    <div className="space-y-1">
                      {schoolSupportOptions.map((option) => (
                        <button
                          key={option.title}
                          onClick={() => applySchoolSupportOption(option)}
                          className="w-full rounded-[0.8rem] px-3 py-2 text-left text-sm text-white/66 transition hover:bg-violet-500/[0.08] hover:text-white"
                        >
                          <span className="block">{option.title}</span>
                          <span className="mt-0.5 block text-[11px] text-white/28">
                            {option.apps}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() =>
                screenSharingActive
                  ? openScreenAssistantWindow() || setShowScreenAssistant(true)
                  : startScreenShare()
              }
              disabled={screenShareStatus === "starting"}
              className={`rounded-[0.82rem] border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:text-white/28 ${
                screenSharingActive
                  ? "border-emerald-300/18 bg-emerald-400/8 text-emerald-100 hover:bg-emerald-400/12"
                  : "border-white/8 bg-transparent text-white/62 hover:border-white/14 hover:bg-white/[0.04] hover:text-white/82"
              }`}
            >
              {screenShareLabel}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-[0.82rem] border border-white/8 bg-transparent px-3 py-2 text-sm text-white/62 transition hover:border-white/14 hover:bg-white/[0.04] hover:text-white/82"
            >
              Attach files
            </button>
            <button
              onClick={toggleVoiceInput}
              disabled={!voiceSupported}
              className="rounded-[0.82rem] border border-white/8 bg-transparent px-3 py-2 text-sm text-white/62 transition hover:border-white/14 hover:bg-white/[0.04] hover:text-white/82 disabled:cursor-not-allowed disabled:text-white/28"
            >
              {isListening ? "Stop voice input" : "Voice input"}
            </button>
            <span className="hidden text-xs text-white/34 sm:inline">
              Shift+Enter for a new line. Type a slash command or open Quick actions when you need a starting frame.
            </span>
          </div>

          <button
            onClick={sendMessage}
            disabled={
              loading ||
              (!hasPendingImage && cooldown > 0) ||
              (hasPendingImage && visionCooldown > 0) ||
              (!input.trim() && pendingAttachments.length === 0)
            }
            className="w-full rounded-[1rem] bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-3 text-base font-medium text-white shadow-[0_10px_24px_rgba(76,29,149,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28 disabled:shadow-none sm:w-auto sm:py-3.5"
          >
            {buttonLabel}
          </button>
        </div>
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

function StatusNote({ label, value }) {
  return (
    <div className="rounded-[0.95rem] border border-white/8 bg-[#090410]/58 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/26">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-white/74">{value}</p>
    </div>
  );
}

function InlineStatus({ label, value }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[0.9rem] border border-white/8 bg-white/[0.025] px-3 py-2 text-sm text-white/52">
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/28">
        {label}
      </span>
      <span className="text-white/68">{value}</span>
    </span>
  );
}

function ConversationSection({
  title,
  description,
  conversations,
  activeConversationId,
  onSelect,
  onRename,
  onDelete,
  mobile = false,
}) {
  if (!conversations.length) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-white/28">
        {title}
      </p>
      {description && (
        <p className="mb-3 max-w-[26rem] text-xs leading-5 text-white/36">{description}</p>
      )}
      <div className={mobile ? "flex gap-3 overflow-x-auto pb-1" : "space-y-2"}>
        {conversations.map((conversation) => {
          const modelLabel =
            MODEL_OPTIONS.find((item) => item.value === conversation.model)?.label ||
            conversation.model;
          const preview = getConversationPreview(conversation);

          return (
            <div
              key={conversation.id}
              className={`${mobile ? "min-w-[240px]" : ""} rounded-[1rem] border px-4 py-3 transition ${
                conversation.id === activeConversationId
                  ? "border-violet-400/18 bg-violet-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  : "border-white/6 bg-[#14151b] hover:border-white/10 hover:bg-[#171920]"
              }`}
            >
              <button onClick={() => onSelect(conversation.id)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
                  <span className="shrink-0 text-[11px] text-white/28">
                    {formatConversationUpdatedAt(conversation.updatedAt)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/38">
                  {preview}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/34">
                  <span>{modelLabel}</span>
                  {conversation.researchMode && <span>Web context</span>}
                  {conversationHasSavedItems(conversation) && <span>Saved</span>}
                </div>
              </button>
              <div className="mt-3 flex gap-3 text-xs text-white/40">
                <button
                  className="transition hover:text-white/75"
                  onClick={() => onRename(conversation.id)}
                >
                  Rename
                </button>
                <button
                  className="transition hover:text-red-200"
                  onClick={() => onDelete(conversation.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
