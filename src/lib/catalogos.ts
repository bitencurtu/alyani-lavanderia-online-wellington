import { supabase } from "@/integrations/supabase/client";

export type HotelLite = {
  id: string;
  nome: string;
};

export type PrestadoraLite = {
  id: string;
  nome: string;
  is_alyani: boolean;
};

export const HOTEIS_LITE_QUERY_KEY = ["hoteis-lite"] as const;
export const PRESTADORAS_LITE_QUERY_KEY = ["prestadoras-lite"] as const;

export async function fetchActiveHoteis(): Promise<HotelLite[]> {
  const { data, error } = await supabase
    .from("hoteis")
    .select("id,nome")
    .eq("status", "ativo")
    .order("nome");

  if (error) throw error;
  return (data ?? []) as HotelLite[];
}

export async function fetchActivePrestadoras(): Promise<PrestadoraLite[]> {
  const { data, error } = await supabase
    .from("prestadoras")
    .select("id,nome,is_alyani")
    .eq("status", "ativo")
    .order("nome");

  if (error) throw error;
  return (data ?? []) as PrestadoraLite[];
}
