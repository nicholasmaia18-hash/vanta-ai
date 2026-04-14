const PROVIDER = "Clerk + Supabase";

export function getSyncReadiness() {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const missing = [];

  if (!hasClerkKey) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!hasSupabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!hasSupabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    provider: PROVIDER,
    ready: missing.length === 0,
    missing,
  };
}
