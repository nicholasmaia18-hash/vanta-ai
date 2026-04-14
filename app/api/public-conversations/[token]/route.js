import {
  getSupabaseAdminClient,
  mapConversationRecord,
} from "@/app/lib/supabase";
import { enforceApiRateLimit, jsonNoStore } from "@/app/lib/security";

export async function GET(req, { params }) {
  const rateLimitError = enforceApiRateLimit(req, "share-read");
  if (rateLimitError) return rateLimitError;

  const { token } = await params;
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return jsonNoStore(
      { error: "Shared conversations are not configured yet." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("vanta_conversations")
    .select("*")
    .eq("public_token", token)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return jsonNoStore(
      { error: "Shared conversation not found." },
      { status: 404 }
    );
  }

  return jsonNoStore({
    conversation: mapConversationRecord(data),
  });
}
