import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role: bypassa RLS. Usar APENAS onde a task mandar (convites).
export function criarClienteServico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
