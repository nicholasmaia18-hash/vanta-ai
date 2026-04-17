import OpenAI from "openai";
import {
  applyCorsHeaders,
  createCorsPreflightResponse,
  enforceApiRateLimit,
  jsonNoStore,
  validateChatPayload,
  validateRequestOrigin,
} from "@/app/lib/security";

const client = new OpenAI({
  apiKey: process.env.SHUTTLEAI_API_KEY,
  baseURL: "https://api.shuttleai.com/v1",
});

const DEFAULT_SYSTEM_PROMPT =
  "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing.";

const RESEARCH_PROMPT =
  "Research mode is enabled. Use the provided search context when available, cite sources inline with markdown links, separate confirmed facts from uncertainty, and say plainly when the search context is thin or inconclusive.";
const AUTO_MODEL = "vanta/auto";
const SMART_MODEL_ALIAS = "vanta/smart";
const FAST_MODEL = "openai/gpt-oss-120b";
const SMART_MODEL = "openai/gpt-5.4";
const FAST_CONTEXT_MESSAGES = 10;
const SMART_CONTEXT_MESSAGES = 18;
const FAST_CONTEXT_CHARS = 6_000;
const SMART_CONTEXT_CHARS = 18_000;
const VISION_CONTEXT_MESSAGES = 6;
const VISION_CONTEXT_CHARS = 6_000;
const FAST_MAX_TOKENS = 360;
const SMART_MAX_TOKENS = 1_000;
const VISION_MAX_TOKENS = 650;
const ATTACHMENT_CONTEXT_WINDOW = 4;
const PROVIDER_RATE_LIMIT_MIN_SECONDS = 120;
const PROVIDER_RATE_LIMIT_BUFFER_SECONDS = 10;

function getProviderCooldownRemaining() {
  const cooldownUntil = globalThis.__vantaProviderCooldownUntil || 0;
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

function rememberProviderCooldown(seconds) {
  const safeSeconds =
    Math.max(Number(seconds) || 0, PROVIDER_RATE_LIMIT_MIN_SECONDS) +
    PROVIDER_RATE_LIMIT_BUFFER_SECONDS;
  globalThis.__vantaProviderCooldownUntil = Date.now() + safeSeconds * 1000;
  return safeSeconds;
}

function getFastModel() {
  return process.env.SHUTTLEAI_FAST_MODEL || FAST_MODEL;
}

function getSmartModel() {
  return process.env.SHUTTLEAI_SMART_MODEL || process.env.SHUTTLEAI_MODEL || SMART_MODEL;
}

function getFallbackModel(primaryModel, { requiresVision = false } = {}) {
  if (requiresVision) {
    const configuredVisionFallback = process.env.SHUTTLEAI_VISION_FALLBACK_MODEL;
    return configuredVisionFallback && configuredVisionFallback !== primaryModel
      ? configuredVisionFallback
      : null;
  }

  const configuredFallback = process.env.SHUTTLEAI_FALLBACK_MODEL;
  if (configuredFallback && configuredFallback !== primaryModel) return configuredFallback;

  const fastModel = getFastModel();
  if (primaryModel !== fastModel) return fastModel;

  const smartModel = getSmartModel();
  return primaryModel !== smartModel ? smartModel : null;
}

function getMessageText(message) {
  return typeof message?.content === "string" ? message.content : "";
}

function getLatestUserMessage(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message.content === "string");
}

function messageHasAttachments(message) {
  return Array.isArray(message?.attachments) && message.attachments.length > 0;
}

function messageHasImage(message) {
  return (message?.attachments || []).some((attachment) => attachment.kind === "image");
}

function shouldUseSmartModel(messages, systemPrompt, researchMode) {
  const latestUserMessage = getLatestUserMessage(messages);
  const latestText = getMessageText(latestUserMessage);
  const allText = messages.map(getMessageText).join("\n");
  const hasAttachment = messages.some(messageHasAttachments);
  const hasImage = messages.some(messageHasImage);
  const hasCustomSchoolMode = /school support mode|reading plus|i-ready|iready|ixl/i.test(
    systemPrompt || ""
  );
  const complexSignals =
    /```|debug|error|stack trace|code|analy[sz]e|reason through|compare|solve|proof|essay|strategy|math|screenshot|image|file|attachment|source|citation|research|calculate|step[- ]by[- ]step/i;

  if (researchMode || hasImage || hasCustomSchoolMode) return true;
  if (hasAttachment && latestText.length > 120) return true;
  if (latestText.length > 700 || allText.length > 8_000) return true;
  return complexSignals.test(latestText);
}

function chooseModel(selectedModel, messages, systemPrompt, researchMode) {
  const fastModel = getFastModel();
  const smartModel = getSmartModel();
  const hasImage = messages.some(messageHasImage);

  if (hasImage) {
    return {
      primaryModel: smartModel,
      modelStrategy: "vision",
      useSmartContext: true,
      contextMessageLimit: VISION_CONTEXT_MESSAGES,
      contextCharLimit: VISION_CONTEXT_CHARS,
      maxTokens: VISION_MAX_TOKENS,
      requiresVision: true,
    };
  }

  if (selectedModel === SMART_MODEL_ALIAS) {
    return {
      primaryModel: smartModel,
      modelStrategy: "smart",
      useSmartContext: true,
      maxTokens: SMART_MAX_TOKENS,
      requiresVision: false,
    };
  }

  if (selectedModel && selectedModel !== AUTO_MODEL && selectedModel !== SMART_MODEL) {
    return {
      primaryModel: selectedModel,
      modelStrategy: selectedModel === fastModel ? "fast" : "custom",
      useSmartContext: selectedModel !== fastModel,
      maxTokens: selectedModel === fastModel ? FAST_MAX_TOKENS : SMART_MAX_TOKENS,
      requiresVision: false,
    };
  }

  const needsSmart = shouldUseSmartModel(messages, systemPrompt, researchMode);
  return {
    primaryModel: needsSmart ? smartModel : fastModel,
    modelStrategy: needsSmart ? "auto-smart" : "auto-fast",
    useSmartContext: needsSmart,
    maxTokens: needsSmart ? SMART_MAX_TOKENS : FAST_MAX_TOKENS,
    requiresVision: false,
  };
}

function estimateMessageChars(message) {
  const attachmentChars = (message.attachments || []).reduce((total, attachment) => {
    if (attachment.kind === "image") return total + 2_000;
    return total + Math.min(String(attachment.data || "").length, 4_000);
  }, 0);

  return getMessageText(message).length + attachmentChars;
}

function stripOlderAttachments(message) {
  if (!messageHasAttachments(message)) return message;

  const names = message.attachments
    .map((attachment) => attachment.name)
    .filter(Boolean)
    .join(", ");

  return {
    ...message,
    attachments: [],
    content: [message.content, names ? `[Older attachments omitted for speed: ${names}]` : null]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function selectContextMessages(messages, route) {
  const maxMessages =
    route.contextMessageLimit ||
    (route.useSmartContext ? SMART_CONTEXT_MESSAGES : FAST_CONTEXT_MESSAGES);
  const maxChars =
    route.contextCharLimit ||
    (route.useSmartContext ? SMART_CONTEXT_CHARS : FAST_CONTEXT_CHARS);
  const selected = [];
  let estimatedChars = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const keepAttachments = messages.length - index <= ATTACHMENT_CONTEXT_WINDOW;
    const message = keepAttachments ? messages[index] : stripOlderAttachments(messages[index]);
    const nextChars = estimateMessageChars(message);

    if (selected.length >= maxMessages) break;
    if (selected.length >= 4 && estimatedChars + nextChars > maxChars) break;

    selected.unshift(message);
    estimatedChars += nextChars;
  }

  return selected.length > 0 ? selected : messages.slice(-1);
}

function buildSpeedInstruction(useSmartContext) {
  if (useSmartContext) {
    return "Response style: start with the answer quickly, then add concise reasoning. Do not over-explain unless the user asks for depth.";
  }

  return "Response style: answer immediately and briefly. Use 2-5 concise sentences by default. If the task needs depth, say the quick answer first and invite the user to ask for more.";
}

function sanitizeAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  return attachments
    .map((attachment) => {
      if (attachment?.kind === "text" && typeof attachment.data === "string") {
        return `Attached file: ${attachment.name}\n${attachment.data}`;
      }

      if (attachment?.kind === "image" && typeof attachment.data === "string") {
        return {
          type: "image_url",
          image_url: {
            url: attachment.data,
          },
        };
      }

      return null;
    })
    .filter(Boolean);
}

function sanitizeMessages(messages = []) {
  return messages
    .filter((message) => message?.role && typeof message.content === "string")
    .map((message) => {
      const attachments = sanitizeAttachments(message.attachments);

      if (attachments.length === 0) {
        return {
          role: message.role,
          content: message.content,
        };
      }

      const contentParts = [{ type: "text", text: message.content }];

      for (const attachment of attachments) {
        if (typeof attachment === "string") {
          contentParts.push({
            type: "text",
            text: `\n\n${attachment}`,
          });
        } else {
          contentParts.push(attachment);
        }
      }

      return {
        role: message.role,
        content: contentParts,
      };
    });
}

function getLatestUserQuery(messages = []) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message.content === "string");

  return latestUserMessage?.content?.trim() || "";
}

function flattenTopics(topics = [], items = []) {
  for (const topic of topics) {
    if (topic?.Topics) {
      flattenTopics(topic.Topics, items);
      continue;
    }

    if (topic?.Text) {
      items.push({
        title: topic.Text.split(" - ")[0] || "Result",
        snippet: topic.Text,
        url: topic.FirstURL || null,
      });
    }
  }

  return items;
}

async function fetchResearchContext(query) {
  if (!query || query.length < 3) return [];
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: {
          "User-Agent": "Vanta Research Mode",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const items = [];

    if (data.AbstractText) {
      items.push({
        title: data.Heading || "DuckDuckGo",
        snippet: data.AbstractText,
        url: data.AbstractURL || null,
      });
    }

    flattenTopics(data.RelatedTopics || [], items);

    return items.slice(0, 5);
  } catch {
    return [];
  }
}

function buildResearchContext(results = []) {
  if (!results.length) return null;

  return [
    "Web research context:",
    ...results.map((result, index) =>
      `${index + 1}. ${result.title}: ${result.snippet}${result.url ? ` (${result.url})` : ""}`
    ),
  ].join("\n");
}

function shouldFetchResearch(researchMode, modelRoute, messages) {
  if (!researchMode) return false;
  if (!modelRoute.requiresVision) return true;

  const latestText = getMessageText(getLatestUserMessage(messages));
  return /web|source|citation|current|recent|latest|news|look up|search/i.test(latestText);
}

async function buildRequest(messages, selectedModel, systemPrompt, researchMode) {
  const modelRoute = chooseModel(selectedModel, messages, systemPrompt, researchMode);
  const fallbackModel = getFallbackModel(modelRoute.primaryModel, {
    requiresVision: modelRoute.requiresVision,
  });
  const contextMessages = selectContextMessages(messages, modelRoute);
  const useResearch = shouldFetchResearch(researchMode, modelRoute, messages);
  const researchQuery = useResearch ? getLatestUserQuery(messages) : "";
  const researchResults = useResearch ? await fetchResearchContext(researchQuery) : [];
  const researchContext = buildResearchContext(researchResults);

  return {
    primaryModel: modelRoute.primaryModel,
    fallbackModel,
    modelStrategy: modelRoute.modelStrategy,
    requiresVision: modelRoute.requiresVision,
    contextMessageCount: contextMessages.length,
    researchResults,
    requestBody: {
      max_tokens: modelRoute.maxTokens,
      messages: [
        {
          role: "system",
          content: [
            systemPrompt || DEFAULT_SYSTEM_PROMPT,
            buildSpeedInstruction(modelRoute.useSmartContext),
            useResearch ? RESEARCH_PROMPT : null,
            researchContext,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...sanitizeMessages(contextMessages),
      ],
    },
  };
}

async function runCompletion({ primaryModel, fallbackModel, requestBody, stream }) {
  try {
    const completion = await client.chat.completions.create({
      model: primaryModel,
      stream,
      ...requestBody,
    });

    return { completion, modelUsed: primaryModel, usedFallback: false };
  } catch (error) {
    const isRateLimited =
      error?.status === 429 || error?.code === "rate_limit_exceeded";

    if (isUnsupportedLimitError(error)) {
      const completion = await client.chat.completions.create({
        model: primaryModel,
        stream,
        ...withoutGenerationLimits(requestBody),
      });

      return { completion, modelUsed: primaryModel, usedFallback: false };
    }

    if (isRateLimited || !fallbackModel || fallbackModel === primaryModel) {
      throw error;
    }

    const completion = await client.chat.completions.create({
      model: fallbackModel,
      stream,
      ...requestBody,
    });

    return { completion, modelUsed: fallbackModel, usedFallback: true };
  }
}

function buildModelHeaders(config, completionResult) {
  return {
    "X-Vanta-Model": completionResult.modelUsed,
    "X-Vanta-Model-Strategy": completionResult.usedFallback
      ? "fallback"
      : config.modelStrategy,
    "X-Vanta-Context-Messages": String(config.contextMessageCount),
  };
}

function withoutGenerationLimits(requestBody) {
  const { max_tokens: _maxTokens, ...rest } = requestBody;
  return rest;
}

function isUnsupportedLimitError(error) {
  const message = String(error?.message || "");
  return (
    error?.status === 400 &&
    /max_tokens|max_completion_tokens|unsupported parameter|unrecognized request argument/i.test(
      message
    )
  );
}

function isUnsupportedImageError(error) {
  const message = String(error?.message || "");
  return /image|vision|multimodal|content part|image_url/i.test(message);
}

function buildErrorResponse(error) {
  console.error("ShuttleAI error:", error);

  const retryAfterRaw =
    error?.headers?.get?.("retry-after") ||
    error?.headers?.["retry-after"] ||
    null;
  const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;
  const isRateLimited =
    error?.status === 429 || error?.code === "rate_limit_exceeded";
  const safeRetryAfter = isRateLimited
    ? rememberProviderCooldown(retryAfter || 60)
    : retryAfter;
  const status = isRateLimited ? 429 : error?.status || (retryAfter ? 429 : 500);
  const message = isUnsupportedImageError(error)
    ? "This model could not read the image. Vanta now routes screenshots to a vision model automatically, so try sending it again."
    : error.message || "Something went wrong";

  return jsonNoStore(
    {
      error: message,
      retryAfter: safeRetryAfter,
      isRateLimited,
      providerRateLimited: isRateLimited,
    },
    { status }
  );
}

export function OPTIONS(req) {
  return createCorsPreflightResponse(req);
}

export async function POST(req) {
  const respond = (response) => applyCorsHeaders(req, response);

  try {
    const originError = validateRequestOrigin(req);
    if (originError) return respond(originError);

    const providerCooldown = getProviderCooldownRemaining();
    if (providerCooldown > 0) {
      return respond(
        jsonNoStore(
          {
            error: `ShuttleAI is cooling down. Wait ${providerCooldown} seconds before sending another message.`,
            retryAfter: providerCooldown,
            isRateLimited: true,
            providerRateLimited: true,
          },
          { status: 429 }
        )
      );
    }

    const rateLimitError = enforceApiRateLimit(req, "chat-write");
    if (rateLimitError) return respond(rateLimitError);

    const contentType = req.headers.get("content-type") || "";
    const acceptsJson = contentType.includes("application/json");
    const acceptsText = contentType.includes("text/plain");

    if (!acceptsJson && !acceptsText) {
      return respond(
        jsonNoStore(
          { error: "Content-Type must be application/json or text/plain." },
          { status: 415 }
        )
      );
    }

    let body;
    try {
      body = acceptsJson ? await req.json() : JSON.parse(await req.text());
    } catch {
      return respond(jsonNoStore({ error: "Request body is invalid JSON." }, { status: 400 }));
    }
    const {
      messages,
      model: selectedModel,
      systemPrompt: validatedPrompt,
      stream,
      researchMode,
    } = validateChatPayload(body);
    const systemPrompt = validatedPrompt || DEFAULT_SYSTEM_PROMPT;
    const config = await buildRequest(
      messages,
      selectedModel,
      systemPrompt,
      researchMode
    );

    if (stream) {
      const completionResult = await runCompletion({
        ...config,
        stream: true,
      });
      const completion = completionResult.completion;

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of completion) {
              const text = chunk.choices?.[0]?.delta?.content || "";
              if (text) controller.enqueue(encoder.encode(text));
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return respond(
        new Response(readable, {
          headers: {
            ...buildModelHeaders(config, completionResult),
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        })
      );
    }

    const completionResult = await runCompletion({
      ...config,
      stream: false,
    });
    const completion = completionResult.completion;

    return respond(
      jsonNoStore({
        reply: completion.choices[0].message.content,
        researchSources: config.researchResults,
      }, {
        headers: buildModelHeaders(config, completionResult),
      })
    );
  } catch (error) {
    return respond(buildErrorResponse(error));
  }
}
