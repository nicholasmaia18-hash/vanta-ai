import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPublicAppUrl,
  getSupabaseAdminClient,
  mapConversationToRecord,
} from "@/app/lib/supabase";

function isShareConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  if (!isShareConfigured()) {
    return NextResponse.json(
      { error: "Shared pages are not configured yet." },
      { status: 503 }
    );
  }

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to create a public share link." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service client is unavailable." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const conversation = body?.conversation;

  if (!conversation?.id) {
    return NextResponse.json(
      { error: "Conversation payload is missing." },
      { status: 400 }
    );
  }

  const publicToken = conversation.publicToken || crypto.randomUUID();
  const record = mapConversationToRecord(userId, {
    ...conversation,
    publicToken,
    shared: true,
  });

  const { error } = await supabase
    .from("vanta_conversations")
    .upsert(record, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = new URL(req.url).origin || getPublicAppUrl();

  return NextResponse.json({
    url: `${origin}/share/${publicToken}`,
    publicToken,
  });
}
