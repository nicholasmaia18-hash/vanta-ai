import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  mapConversationRecord,
} from "@/app/lib/supabase";

export async function GET(_req, { params }) {
  const { token } = await params;
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Shared conversation not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    conversation: mapConversationRecord(data),
  });
}
