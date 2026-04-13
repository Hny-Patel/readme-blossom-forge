import { supabase } from "@/integrations/supabase/client";

export function logAudit(userId: string, action: string, details?: object) {
  (supabase as any)
    .from("audit_log")
    .insert({ user_id: userId, action, details: details || null })
    .then(); // fire-and-forget — never blocks UI
}
