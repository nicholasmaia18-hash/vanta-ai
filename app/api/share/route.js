import { auth } from "@clerk/nextjs/server";
import {
  getPublicAppUrl,
  getSupabaseAdminClient,
  mapConversationToRecord,
} from "@/app/lib/supabase";
import {
  enforceApiRateLimit,
  jsonNoStore,
  validateConversation,
  validateRequestOrigin,
} from "@/app/lib/security";

function isShareConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  const originError = validateRequestOrigin(req);
  if (originError) return originError;

  const rateLimitError = enforceApiRateLimit(req, "share-write");
  if (rateLimitError) return rateLimitError;

  if (!isShareConfigured()) {
    return jsonNoStore(
      { error: "Shared pages are not configured yet." },
      { status: 503 }
    );
  }

  const { userId } = await auth();

  if (!userId) {
    return jsonNoStore(
      { error: "Sign in to create a public share link." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return jsonNoStore(
      { error: "Supabase service client is unavailable." },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return jsonNoStore({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  const body = await req.json();
  let conversation = null;

  try {
    conversation = body?.conversation ? validateConversation(body.conversation) : null;
  } catch (error) {
    return jsonNoStore(
      { error: error.message || "Conversation payload is invalid." },
      { status: error.status || 400 }
    );
  }

  if (!conversation?.id) {
    return jsonNoStore(
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
    return jsonNoStore({ error: error.message }, { status: 500 });
  }

  const origin = new URL(req.url).origin || getPublicAppUrl();

  return jsonNoStore({
    url: `${origin}/share/${publicToken}`,
    publicToken,
  });
}
