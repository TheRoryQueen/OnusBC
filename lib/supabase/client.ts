import { createBrowserClient } from "@supabase/ssr";

// Browser client: publishable (anon) key only. Row level security does the guarding.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
