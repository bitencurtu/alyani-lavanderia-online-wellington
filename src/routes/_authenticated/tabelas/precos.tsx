import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brlNumber, isoDate } from "@/lib/format";
import { Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tabelas/precos")({
  head: () => ({ meta: [{ title: "Tabela de Preços — Alyani" }] }),
  component: Page,
});

type Row = { peca_id: string; nome: string; valor_normal: number; valor_expresso: number; existing_id?: string };

function Page() {
  const qc = useQueryClient();
  const [hotelId, setHotelId] = useState<string>("");
  const [vigencia, setVigencia] = useState<string>(isoDate());

  const { data: hoteisData } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("hoteis").select("id,nome").eq("status", "ativo").order("nome");
      return data ?? [];
    },
  });

  const { data: pecasData } = useQuery({
    queryKey: ["pecas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("pecas").select("id,nome").eq("status", "ativo").order("nome");
      return data ?? [];
    },
  });

  const { data: precosData } = useQuery({
    queryKey: ["precos", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data } = await supabase.from("tabela_precos").select("*").eq("hotel_id", hotelId).order("data_vigencia", { ascending: false });
      return data ?? [];
    },
  });

  const hoteis = useMemo(() => hoteisData ?? [], [hoteisData]);
  const pecas = useMemo(() => pecasData ?? [], [pecasData]);
  const precos = useMemo(() => precosData ?? [], [precosData]);

  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!pecas.length) return;
    const latest = new Map<string, any>();
    for (const p of precos as any[]) { if (p.data_vigencia > vigencia) continue; if (!latest.has(p.peca_id)) latest.set(p.peca_id, p); }
    const exact = new Map<string, any>();
    for (const p of precos as any[]) if (p.data_vigencia === vigencia) exact.set(p.peca_id, p);
    setRows((pecas as any[]).map((pc) => {
      const src = exact.get(pc.id) ?? latest.get(pc.id);
      return { peca_id: pc.id, nome: pc.nome, valor_normal: Number(src?.valor_normal ?? 0), valor_expresso: Number(src?.valor_expresso ?? 0), existing_id: exact.get(pc.id)?.id };
    }));
  }, [pecas, precos, vigencia]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => {
        const item: any = {
          hotel_id: hotelId,
          peca_id: r.peca_id,
          valor_normal: r.valor_normal,
          valor_expresso: r.valor_expresso,
          data_vigencia: vigencia,
          status: "ativo"
        };
        if (r.existing_id) {
          item.id = r.existing_id;
        }
        return item;
      });
      const { error } = await supabase.from("tabela_precos").upsert(payload as any, { onConflict: "hotel_id,peca_id,data_vigencia" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Preços salvos."); qc.invalidateQueries({ queryKey: ["precos", hotelId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Tabela de Preços" description="Preços por hotel. O sistema usa a vigência mais recente até a data do roll."
        actions={<Button size="sm" disabled={!hotelId || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4 mr-1" /> Salvar vigência</Button>} />
      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
          <Select value={hotelId} onValueChange={setHotelId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um hotel…" /></SelectTrigger>
            <SelectContent>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Data de vigência</Label>
          <Input type="date" className="h-9 w-[160px]" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        </div>
      </div>
      {!hotelId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">Selecione um hotel para editar os preços.</div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Peça</th>
                <th className="text-right px-4 py-2 font-medium w-40">Valor normal</th>
                <th className="text-right px-4 py-2 font-medium w-40">Valor expresso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.peca_id} className="border-t">
                  <td className="px-4 py-1.5">{r.nome}</td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} className="h-8 text-right font-mono" value={r.valor_normal}
                      onChange={(e) => setRows((rs) => rs.map((x, i) => i === idx ? { ...x, valor_normal: Number(e.target.value) } : x))} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} className="h-8 text-right font-mono" value={r.valor_expresso}
                      onChange={(e) => setRows((rs) => rs.map((x, i) => i === idx ? { ...x, valor_expresso: Number(e.target.value) } : x))} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30"><tr>
              <td className="px-4 py-2 text-xs text-muted-foreground">Total de peças: {rows.length}</td>
              <td className="px-4 py-2 text-right font-mono text-xs">Σ {brlNumber(rows.reduce((s, r) => s + r.valor_normal, 0))}</td>
              <td className="px-4 py-2 text-right font-mono text-xs">Σ {brlNumber(rows.reduce((s, r) => s + r.valor_expresso, 0))}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </>
  );
}