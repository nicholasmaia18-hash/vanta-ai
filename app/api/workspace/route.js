import { auth } from "@clerk/nextjs/server";
import {
  getSupabaseAdminClient,
  mapConversationRecord,
  mapConversationToRecord,
  sortConversations,
} from "@/app/lib/supabase";
import {
  enforceApiRateLimit,
  jsonNoStore,
  validateRequestOrigin,
  validateWorkspacePayload,
} from "@/app/lib/security";

function getServerReadiness() {
  const missing = [];

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  if (!process.env.CLERK_SECRET_KEY) {
    missing.push("CLERK_SECRET_KEY");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

async function requireUser() {
  const readiness = getServerReadiness();
  if (!readiness.ready) {
    return {
      error: jsonNoStore(
        {
          error: "Account sync is not configured yet.",
          missing: readiness.missing,
        },
        { status: 503 }
      ),
    };
  }

  const { userId } = await auth();

  if (!userId) {
    return {
      error: jsonNoStore(
        { error: "Sign in to use account sync." },
        { status: 401 }
      ),
    };
  }

  return { userId };
}

export async function GET(req) {
  const originError = validateRequestOrigin(req);
  if (originError) return originError;

  const rateLimitError = enforceApiRateLimit(req, "workspace-read");
  if (rateLimitError) return rateLimitError;

  const gate = await requireUser();
  if (gate.error) return gate.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return jsonNoStore(
      { error: "Supabase service client is unavailable." },
      { status: 503 }
    );
  }

  const [conversationsResponse, workspaceResponse] = await Promise.all([
    supabase
      .from("vanta_conversations")
      .select("*")
      .eq("user_id", gate.userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("vanta_workspace_state")
      .select("*")
      .eq("user_id", gate.userId)
      .maybeSingle(),
  ]);

  if (conversationsResponse.error) {
    return jsonNoStore(
      { error: conversationsResponse.error.message },
      { status: 500 }
    );
  }

  if (workspaceResponse.error) {
    return jsonNoStore(
      { error: workspaceResponse.error.message },
      { status: 500 }
    );
  }

  const conversations = sortConversations(
    (conversationsResponse.data || []).map(mapConversationRecord)
  );

  return jsonNoStore({
    conversations,
    activeConversationId:
      workspaceResponse.data?.active_conversation_id || conversations[0]?.id || null,
    usageTimestamps: Array.isArray(workspaceResponse.data?.usage_timestamps)
      ? workspaceResponse.data.usage_timestamps
      : [],
  });
}

export async function POST(req) {
  const originError = validateRequestOrigin(req);
  if (originError) return originError;

  const rateLimitError = enforceApiRateLimit(req, "workspace-write");
  if (rateLimitError) return rateLimitError;

  const gate = await requireUser();
  if (gate.error) return gate.error;

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
  let conversations;
  let activeConversationId;
  let usageTimestamps;

  try {
    ({ conversations, activeConversationId, usageTimestamps } =
      validateWorkspacePayload(body));
  } catch (error) {
    return jsonNoStore(
      { error: error.message || "Workspace payload is invalid." },
      { status: error.status || 400 }
    );
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("vanta_conversations")
    .select("id")
    .eq("user_id", gate.userId);

  if (existingError) {
    return jsonNoStore(
      { error: existingError.message },
      { status: 500 }
    );
  }

  const incomingIds = new Set(conversations.map((conversation) => conversation.id));
  const removedIds = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !incomingIds.has(id));

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("vanta_conversations")
      .delete()
      .eq("user_id", gate.userId)
      .in("id", removedIds);

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 500 });
    }
  }

  if (conversations.length > 0) {
    const records = conversations.map((conversation) =>
      mapConversationToRecord(gate.userId, conversation)
    );

    const { error } = await supabase
      .from("vanta_conversations")
      .upsert(records, { onConflict: "id" });

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 500 });
    }
  }

  const { error: workspaceError } = await supabase
    .from("vanta_workspace_state")
    .upsert(
      {
        user_id: gate.userId,
        active_conversation_id: activeConversationId,
        usage_timestamps: usageTimestamps,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (workspaceError) {
    return jsonNoStore(
      { error: workspaceError.message },
      { status: 500 }
    );
  }

  return jsonNoStore({ ok: true });
}
