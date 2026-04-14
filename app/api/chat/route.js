import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.SHUTTLEAI_API_KEY,
  baseURL: "https://api.shuttleai.com/v1",
});

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    const primaryModel = process.env.SHUTTLEAI_MODEL || "openai/gpt-5.4";
    const fallbackModel = process.env.SHUTTLEAI_FALLBACK_MODEL || null;

    const requestBody = {
      messages: [
        {
          role: "system",
          content:
            "You are Vanta, a clear, helpful AI assistant inside a minimalist web app. Keep responses concise but useful. Use short paragraphs by default. Use flat bullet lists only when they genuinely improve clarity. When giving steps, prefer brief numbered lists. If code helps, include small clean code blocks with a short explanation. Avoid filler, hype, and overly casual phrasing.",
        },
        ...messages,
      ],
    };

    let completion;

    try {
      completion = await client.chat.completions.create({
        model: primaryModel,
        ...requestBody,
      });
    } catch (error) {
      const isRateLimited =
        error?.status === 429 || error?.code === "rate_limit_exceeded";

      if (!fallbackModel || !isRateLimited || fallbackModel === primaryModel) {
        throw error;
      }

      completion = await client.chat.completions.create({
        model: fallbackModel,
        ...requestBody,
      });
    }

    return NextResponse.json({
      reply: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("ShuttleAI error:", error);

    const retryAfterRaw =
      error?.headers?.get?.("retry-after") ||
      error?.headers?.["retry-after"] ||
      null;
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;
    const isRateLimited =
      error?.status === 429 || error?.code === "rate_limit_exceeded";
    const safeRetryAfter = isRateLimited
      ? Math.max(retryAfter || 0, 60)
      : retryAfter;
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
}
