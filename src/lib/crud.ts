import { supabase } from "@/integrations/supabase/client";

export async function listAll<T = any>(
  table: string,
  orderBy: { column: string; ascending?: boolean } = { column: "nome", ascending: true },
): Promise<T[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .order(orderBy.column, { ascending: orderBy.ascending ?? true });
  if (error) throw error;
  return (data ?? []) as T[];
}