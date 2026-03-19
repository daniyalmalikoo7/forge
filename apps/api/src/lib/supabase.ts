import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

let _adminClient: SupabaseClient<Database> | null = null;
let _anonClient: SupabaseClient<Database> | null = null;

function getUrl(): string {
  const url = process.env["SUPABASE_URL"];
  if (!url) throw new Error("Missing SUPABASE_URL env var");
  return url;
}

/**
 * Admin client — uses SUPABASE_SERVICE_ROLE_KEY, bypasses RLS.
 * Use this for ALL server-side API route operations.
 */
export function adminClient(): SupabaseClient<Database> {
  if (_adminClient) return _adminClient;

  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

  _adminClient = createClient<Database>(getUrl(), key);
  return _adminClient;
}

/**
 * Anon client — uses SUPABASE_ANON_KEY, subject to RLS.
 * Reserved for future client-side / browser use.
 */
export function anonClient(): SupabaseClient<Database> {
  if (_anonClient) return _anonClient;

  const key = process.env["SUPABASE_ANON_KEY"];
  if (!key) throw new Error("Missing SUPABASE_ANON_KEY env var");

  _anonClient = createClient<Database>(getUrl(), key);
  return _anonClient;
}
