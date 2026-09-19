import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/operacao/conferencia")({
  head: () => ({ meta: [{ title: "Conferência — Alyani" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const [rollAlyaniId, setRollAlyaniId] = useState("");
  const [rollPrestadoraId, setRollPrestadoraId] = useState("");

  const { data: rollsAlyani = [] } = useQuery({
    queryKey: ["rolls_alyani_all"],
    queryFn: async () => (await supabase.from("rolls_alyani").select("id,numero,data_roll,hoteis(nome),prestadora_id").order("data_roll", { ascending: false }).limit(300)).data ?? [],
  });
  const { data: rollsPrest = [] } = useQuery({
    queryKey: ["rolls_prestadora_all"],
    queryFn: async () => (await supabase.from("rolls_prestadora").select("id,numero,data_roll,prestadora_id,prestadoras(nome)").order("data_roll", { ascending: false }).limit(300)).data ?? [],
  });

  const { data: itensAlyani = [] } = useQuery({
    queryKey: ["conf-ra", rollAlyaniId],
    enabled: !!rollAlyaniId,
    queryFn: async () => (await supabase.from("rolls_alyani_itens").select("peca_id, quantidade, pecas(nome)").eq("roll_id", rollAlyaniId)).data ?? [],
  });
  const { data: itensPrest = [] } = useQuery({
    queryKey: ["conf-rp", rollPrestadoraId],
    enabled: !!rollPrestadoraId,
    queryFn: async () => (await supabase.from("rolls_prestadora_itens").select("peca_id, quantidade, pecas(nome)").eq("roll_id", rollPrestadoraId)).data ?? [],
  });

  const linhas = useMemo(() => {
    const map = new Map<string, { peca_id: string; nome: string; qtd_alyani: number; qtd_prest: number }>();
    for (const i of itensAlyani as any[]) {
      map.set(i.peca_id, { peca_id: i.peca_id, nome: i.pecas?.nome ?? "—", qtd_alyani: Number(i.quantidade), qtd_prest: 0 });
    }
    for (const i of itensPrest as any[]) {
      const cur = map.get(i.peca_id);
      if (cur) cur.qtd_prest = Number(i.quantidade);
      else map.set(i.peca_id, { peca_id: i.peca_id, nome: i.pecas?.nome ?? "—", qtd_alyani: 0, qtd_prest: Number(i.quantidade) });
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itensAlyani, itensPrest]);

  const totalDiv = linhas.reduce((s, l) => s + (l.qtd_alyani !== l.qtd_prest ? 1 : 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("conferencias").upsert({
        roll_alyani_id: rollAlyaniId, roll_prestadora_id: rollPrestadoraId, total_divergencias: totalDiv,
      } as any, { onConflict: "roll_alyani_id,roll_prestadora_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conferência salva."); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Conferência" description="Comparar Roll Alyani × Roll Prestadora."
        actions={<Button size="sm" disabled={!rollAlyaniId || !rollPrestadoraId || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4 mr-1" /> Salvar conferência</Button>} />

      <div className="rounded-md border bg-card p-3 mb-4 grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Roll Alyani</Label>
          <Select value={rollAlyaniId} onValueChange={setRollAlyaniId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{(rollsAlyani as any[]).map((r) => <SelectItem key={r.id} value={r.id}>{r.numero} — {r.hoteis?.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Roll Prestadora</Label>
          <Select value={rollPrestadoraId} onValueChange={setRollPrestadoraId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{(rollsPrest as any[]).map((r) => <SelectItem key={r.id} value={r.id}>{r.numero} — {r.prestadoras?.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {(!rollAlyaniId || !rollPrestadoraId) ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">Selecione os dois rolls para conferir.</div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-sm font-medium">Comparativo por peça</span>
            <span className={`text-sm ${totalDiv > 0 ? "text-destructive font-semibold" : "text-success font-semibold"}`}>
              {totalDiv > 0 ? `${totalDiv} divergência(s)` : "Sem divergências"}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Peça</th>
                <th className="text-right px-4 py-2 font-medium w-32">Alyani</th>
                <th className="text-right px-4 py-2 font-medium w-32">Prestadora</th>
                <th className="text-right px-4 py-2 font-medium w-32">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const diff = l.qtd_alyani - l.qtd_prest;
                return (
                  <tr key={l.peca_id} className="border-t">
                    <td className="px-4 py-1.5">{l.nome}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{l.qtd_alyani}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{l.qtd_prest}</td>
                    <td className={`px-4 py-1.5 text-right font-mono ${diff !== 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{diff > 0 ? `+${diff}` : diff}</td>
                  </tr>
                );
              })}
              {linhas.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sem itens nos rolls selecionados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}