import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.SHUTTLEAI_API_KEY,
  baseURL: "https://api.shuttleai.com/v1",
});

const DEFAULT_SYSTEM_PROMPT =
  "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing.";

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

function buildRequest(messages, selectedModel, systemPrompt) {
  const primaryModel =
    selectedModel || process.env.SHUTTLEAI_MODEL || "openai/gpt-5.4";
  const fallbackModel = process.env.SHUTTLEAI_FALLBACK_MODEL || null;

  return {
    primaryModel,
    fallbackModel,
    requestBody: {
      messages: [
        {
          role: "system",
          content: systemPrompt || DEFAULT_SYSTEM_PROMPT,
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

    const config = buildRequest(messages, selectedModel, systemPrompt);

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
    });
  } catch (error) {
    return buildErrorResponse(error);
  }
}
