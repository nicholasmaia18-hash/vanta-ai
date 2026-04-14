import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.SHUTTLEAI_API_KEY,
  baseURL: "https://api.shuttleai.com/v1",
});

const DEFAULT_SYSTEM_PROMPT =
  "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing.";

const RESEARCH_PROMPT =
  "Research mode is enabled. Use the provided search context when available, cite sources inline with markdown links, separate confirmed facts from uncertainty, and say plainly when the search context is thin or inconclusive.";

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

async function buildRequest(messages, selectedModel, systemPrompt, researchMode) {
  const primaryModel =
    selectedModel || process.env.SHUTTLEAI_MODEL || "openai/gpt-5.4";
  const fallbackModel = process.env.SHUTTLEAI_FALLBACK_MODEL || null;
  const researchQuery = researchMode ? getLatestUserQuery(messages) : "";
  const researchResults = researchMode ? await fetchResearchContext(researchQuery) : [];
  const researchContext = buildResearchContext(researchResults);

  return {
    primaryModel,
    fallbackModel,
    researchResults,
    requestBody: {
      messages: [
        {
          role: "system",
          content: [
            systemPrompt || DEFAULT_SYSTEM_PROMPT,
            researchMode ? RESEARCH_PROMPT : null,
            researchContext,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...sanitizeMessages(messages),
      ],
    },
  };
}

async function runCompletion({ primaryModel, fallbackModel, requestBody, stream }) {
  try {
    return await client.chat.completions.create({
      model: primaryModel,
      stream,
      ...requestBody,
    });
  } catch (error) {
    const isRateLimited =
      error?.status === 429 || error?.code === "rate_limit_exceeded";

    if (!fallbackModel || !isRateLimited || fallbackModel === primaryModel) {
      throw error;
    }

    return client.chat.completions.create({
      model: fallbackModel,
      stream,
      ...requestBody,
    });
  }
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
  const safeRetryAfter = isRateLimited ? Math.max(retryAfter || 0, 60) : retryAfter;
  const status = error?.status || (retryAfter ? 429 : 500);

  return NextResponse.json(
    {
      error: error.message || "Something went wrong",
      retryAfter: safeRetryAfter,
      isRateLimited,
    },
    { status }
  );
}

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    const selectedModel = body.model || null;
    const systemPrompt = body.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const stream = Boolean(body.stream);
    const researchMode = Boolean(body.researchMode);

    const config = await buildRequest(
      messages,
      selectedModel,
      systemPrompt,
      researchMode
    );

    if (stream) {
      const completion = await runCompletion({
        ...config,
        stream: true,
      });

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

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    const completion = await runCompletion({
      ...config,
      stream: false,
    });

    return NextResponse.json({
      reply: completion.choices[0].message.content,
      researchSources: config.researchResults,
    });
  } catch (error) {
    return buildErrorResponse(error);
  }
}
