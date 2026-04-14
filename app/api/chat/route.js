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

    const completion = await client.chat.completions.create({
      model: "openai/gpt-5.4",
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant on my website.",
        },
        ...messages,
      ],
    });

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
