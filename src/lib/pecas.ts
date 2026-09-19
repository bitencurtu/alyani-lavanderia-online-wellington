import { supabase } from "@/integrations/supabase/client";

export type PecaLite = {
  id: string;
  nome: string;
};

export const PECAS_LITE_QUERY_KEY = ["pecas-lite"] as const;

export async function fetchActivePecas(): Promise<PecaLite[]> {
  const { data, error } = await supabase
    .from("pecas")
    .select("id,nome")
    .eq("status", "ativo")
    .order("nome");

  if (error) throw error;
  return (data ?? []) as PecaLite[];
}
