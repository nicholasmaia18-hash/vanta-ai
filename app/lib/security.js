import { NextResponse } from "next/server";

const DEFAULT_APP_URL = "https://vanta-ai-chat.vercel.app";
const DEFAULT_BUNNY_URL = "https://vanta-ai.b-cdn.net";

export const LIMITS = {
  attachmentCount: 4,
  burstWindowMs: 15_000,
  burstWindowRequests: 3,
  conversationCount: 50,
  conversationTitleChars: 120,
  longWindowMs: 10 * 60_000,
  longWindowRequests: 18,
  imageAttachmentChars: 7_000_000,
  messageChars: 8_000,
  messageCount: 40,
  messageCountPerConversation: 120,
  modelChars: 100,
  systemPromptChars: 6_000,
  textAttachmentChars: 40_000,
  usageTimestampCount: 200,
};

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function getConfiguredOrigin(value) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(req) {
  const origins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    DEFAULT_APP_URL,
    DEFAULT_BUNNY_URL,
  ]);

  const requestOrigin = getConfiguredOrigin(req.url);
  const appOrigin = getConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const vercelOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

  for (const origin of [requestOrigin, appOrigin, vercelOrigin]) {
    if (origin) origins.add(origin);
  }

  return origins;
}

function getRequestStore() {
  if (!globalThis.__vantaRequestStore) {
    globalThis.__vantaRequestStore = new Map();
  }

  return globalThis.__vantaRequestStore;
}

function cleanupRequestStore(store, now) {
  for (const [key, value] of store.entries()) {
    const recentBurst = value.burst.filter((timestamp) => now - timestamp < LIMITS.burstWindowMs);
    const recentLong = value.long.filter((timestamp) => now - timestamp < LIMITS.longWindowMs);

    if (recentBurst.length === 0 && recentLong.length === 0) {
      store.delete(key);
      continue;
    }

    store.set(key, {
      ...value,
      burst: recentBurst,
      long: recentLong,
    });
  }
}

export function getClientFingerprint(req) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const clientIp =
    forwardedFor.split(",")[0]?.trim() ||
    realIp.trim() ||
    "unknown-ip";
  const userAgent = (req.headers.get("user-agent") || "unknown-agent").slice(0, 180);
  const acceptLanguage = (req.headers.get("accept-language") || "").slice(0, 120);

  return `${clientIp}|${userAgent}|${acceptLanguage}`;
}

export function enforceApiRateLimit(req, scope = "chat") {
  const now = Date.now();
  const store = getRequestStore();
  cleanupRequestStore(store, now);

  const key = `${scope}:${getClientFingerprint(req)}`;
  const record = store.get(key) || { burst: [], long: [] };
  const burst = record.burst.filter((timestamp) => now - timestamp < LIMITS.burstWindowMs);
  const long = record.long.filter((timestamp) => now - timestamp < LIMITS.longWindowMs);

  if (burst.length >= LIMITS.burstWindowRequests) {
    const retryAfter = Math.max(
      1,
      Math.ceil((LIMITS.burstWindowMs - (now - burst[0])) / 1000)
    );

    return jsonNoStore(
      {
        error: "Too many requests in a short burst. Slow down and try again.",
        retryAfter,
        isRateLimited: true,
      },
      { status: 429 }
    );
  }

  if (long.length >= LIMITS.longWindowRequests) {
    const retryAfter = Math.max(
      1,
      Math.ceil((LIMITS.longWindowMs - (now - long[0])) / 1000)
    );

    return jsonNoStore(
      {
        error: "Too many requests from this device recently. Try again a bit later.",
        retryAfter,
        isRateLimited: true,
      },
      { status: 429 }
    );
  }

  burst.push(now);
  long.push(now);
  store.set(key, { burst, long });
  return null;
}

export function validateRequestOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  const allowedOrigins = getAllowedOrigins(req);
  if (allowedOrigins.has(origin)) return null;

  return jsonNoStore(
    { error: "Untrusted request origin." },
    { status: 403 }
  );
}

export function applyCorsHeaders(req, response) {
  const origin = req.headers.get("origin");
  if (!origin || !getAllowedOrigins(req).has(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.append("Vary", "Origin");
  return response;
}

export function createCorsPreflightResponse(req) {
  const origin = req.headers.get("origin");
  if (!origin || !getAllowedOrigins(req).has(origin)) {
    return jsonNoStore({ error: "Untrusted request origin." }, { status: 403 });
  }

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new Response(null, { status: 204, headers });
}

export function jsonNoStore(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

function assertString(value, field, maxLength) {
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw badRequest(`${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw badRequest(`${field} is too long.`);
  }

  return trimmed;
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    throw badRequest("Attachment payload is invalid.");
  }

  const name = assertString(
    attachment.name || "attachment",
    "Attachment name",
    LIMITS.conversationTitleChars
  );
  const kind = attachment.kind;

  if (kind === "text") {
    const data = assertString(
      attachment.data || "",
      "Text attachment",
      LIMITS.textAttachmentChars
    );

    return {
      id: attachment.id || crypto.randomUUID(),
      kind,
      name,
      mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : "text/plain",
      data,
    };
  }

  if (kind === "image") {
    const data = assertString(
      attachment.data || "",
      "Image attachment",
      LIMITS.imageAttachmentChars
    );

    if (!data.startsWith("data:image/")) {
      throw badRequest("Image attachment must be a valid data URL.");
    }

    return {
      id: attachment.id || crypto.randomUUID(),
      kind,
      name,
      mimeType:
        typeof attachment.mimeType === "string" ? attachment.mimeType : "image/png",
      data,
    };
  }

  throw badRequest("Unsupported attachment type.");
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    throw badRequest("Message payload is invalid.");
  }

  const role = message.role;
  if (!["user", "assistant", "system"].includes(role)) {
    throw badRequest("Message role is invalid.");
  }

  const content =
    typeof message.content === "string"
      ? message.content.trim().slice(0, LIMITS.messageChars)
      : "";

  const attachments = Array.isArray(message.attachments)
    ? message.attachments.slice(0, LIMITS.attachmentCount).map(normalizeAttachment)
    : [];

  return {
    id: message.id || crypto.randomUUID(),
    role,
    content,
    attachments,
  };
}

export function validateChatPayload(body) {
  const messages = Array.isArray(body?.messages)
    ? body.messages.slice(0, LIMITS.messageCount).map(normalizeMessage)
    : [];

  if (messages.length === 0) {
    throw badRequest("At least one message is required.");
  }

  const model =
    typeof body?.model === "string" && body.model.length <= LIMITS.modelChars
      ? body.model
      : null;
  const systemPrompt =
    typeof body?.systemPrompt === "string"
      ? body.systemPrompt.slice(0, LIMITS.systemPromptChars)
      : null;

  return {
    messages,
    model,
    systemPrompt,
    stream: Boolean(body?.stream),
    researchMode: Boolean(body?.researchMode),
  };
}

export function validateConversation(conversation) {
  if (!conversation || typeof conversation !== "object") {
    throw badRequest("Conversation payload is invalid.");
  }

  const id = assertString(conversation.id, "Conversation id", 80);
  const title =
    typeof conversation.title === "string" && conversation.title.trim()
      ? conversation.title.trim().slice(0, LIMITS.conversationTitleChars)
      : "New conversation";
  const model =
    typeof conversation.model === "string" && conversation.model.length <= LIMITS.modelChars
      ? conversation.model
      : "openai/gpt-5.4";
  const systemPrompt =
    typeof conversation.systemPrompt === "string"
      ? conversation.systemPrompt.slice(0, LIMITS.systemPromptChars)
      : "";
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages
        .slice(0, LIMITS.messageCountPerConversation)
        .map(normalizeMessage)
    : [];

  return {
    ...conversation,
    id,
    title,
    model,
    systemPrompt,
    researchMode: Boolean(conversation.researchMode),
    messages,
    createdAt:
      typeof conversation.createdAt === "number" ? conversation.createdAt : Date.now(),
    updatedAt:
      typeof conversation.updatedAt === "number" ? conversation.updatedAt : Date.now(),
    publicToken:
      typeof conversation.publicToken === "string" ? conversation.publicToken : null,
    shared: Boolean(conversation.shared),
  };
}

export function validateWorkspacePayload(body) {
  const conversations = Array.isArray(body?.conversations)
    ? body.conversations.slice(0, LIMITS.conversationCount).map(validateConversation)
    : [];

  return {
    conversations,
    activeConversationId:
      typeof body?.activeConversationId === "string" ? body.activeConversationId : null,
    usageTimestamps: Array.isArray(body?.usageTimestamps)
      ? body.usageTimestamps
          .filter((value) => typeof value === "number" && Number.isFinite(value))
          .slice(-LIMITS.usageTimestampCount)
      : [],
  };
}
