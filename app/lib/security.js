import { NextResponse } from "next/server";

const DEFAULT_APP_URL = "https://vanta-ai-chat.vercel.app";

export const LIMITS = {
  attachmentCount: 4,
  conversationCount: 50,
  conversationTitleChars: 120,
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
