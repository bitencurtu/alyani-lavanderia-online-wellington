import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/operacao/roll-alyani/$id")({
  head: () => ({ meta: [{ title: "Roll Alyani — Alyani" }] }),
  component: Page,
});

type Item = {
  id?: string;
  peca_id: string;
  quantidade: number;
  expresso_item: boolean;
  valor_unit?: number;
  valor_total?: number;
  custo_unit?: number;
  custo_total?: number;
};

function Page() {
  console.log("roll-alyani.$id montado");
  const { id } = Route.useParams();
  console.log("roll-alyani.$id id:", id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: roll, refetch } = useQuery({
    queryKey: ["roll", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rolls_alyani").select("*, hoteis(nome), prestadoras(nome)").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: itens = [], refetch: refetchItens } = useQuery({
    queryKey: ["roll-itens", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rolls_alyani_itens").select("*, pecas(nome)").eq("roll_id", id).order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: pecas = [] } = useQuery({
    queryKey: ["pecas-lite"],
    queryFn: async () => (await supabase.from("pecas").select("id,nome").eq("status", "ativo").order("nome")).data ?? [],
  });
  const { data: prestadoras = [] } = useQuery({
    queryKey: ["prestadoras-lite"],
    queryFn: async () => (await supabase.from("prestadoras").select("id,nome").eq("status", "ativo").order("nome")).data ?? [],
  });

  const [header, setHeader] = useState<any>(null);
  useEffect(() => { if (roll) setHeader(roll); }, [roll]);

  const invalidateAllRelatedQueries = () => {
    qc.invalidateQueries({ queryKey: ["rolls-fluxo"] });
    qc.invalidateQueries({ queryKey: ["rel-financeiro"] });
    qc.invalidateQueries({ queryKey: ["rel-hotel"] });
    qc.invalidateQueries({ queryKey: ["rel-prestadora"] });
    qc.invalidateQueries({ queryKey: ["rel-cliente"] });
    qc.invalidateQueries({ queryKey: ["cobrancas"] });
    qc.invalidateQueries({ queryKey: ["pagamentos"] });
  };

  const saveHeader = useMutation({
    mutationFn: async () => {
      const payload = {
        numero: header.numero,
        data_roll: header.data_roll,
        data_vencimento: header.data_vencimento,
        expresso: header.expresso,
        cobrada: header.cobrada,
        nf_fat: header.nf_fat,
        prestadora_id: header.prestadora_id,
        observacoes: header.observacoes,
      };
      const { error } = await supabase.from("rolls_alyani").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Roll atualizado. Itens recalculados.");
      // Invalidate all related queries
      await qc.invalidateQueries({ queryKey: ["roll", id] });
      await qc.invalidateQueries({ queryKey: ["roll-itens", id] });
      await qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      invalidateAllRelatedQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertItem = useMutation({
    mutationFn: async (it: Item) => {
      if (it.id) {
        const { error } = await supabase.from("rolls_alyani_itens").update({ peca_id: it.peca_id, quantidade: it.quantidade, expresso_item: it.expresso_item }).eq("id", it.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rolls_alyani_itens").insert({ roll_id: id, peca_id: it.peca_id, quantidade: it.quantidade, expresso_item: it.expresso_item } as any);
        if (error) throw error;
      }
    },
    onSuccess: async () => { 
      await refetchItens(); 
      await refetch(); 
      await qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      invalidateAllRelatedQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (iid: string) => { const { error } = await supabase.from("rolls_alyani_itens").delete().eq("id", iid); if (error) throw error; },
    onSuccess: async () => { 
      await refetchItens(); 
      await refetch(); 
      await qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      invalidateAllRelatedQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [novoItem, setNovoItem] = useState<Item>({ peca_id: "", quantidade: 1, expresso_item: false });

  const totais = useMemo(() => {
    return {
      qtd: itens.reduce((s: number, i: any) => s + Number(i.quantidade ?? 0), 0),
      receita: itens.reduce((s: number, i: any) => s + Number(i.valor_total ?? 0), 0),
      custo: itens.reduce((s: number, i: any) => s + Number(i.custo_total ?? 0), 0),
    };
  }, [itens]);

  if (!header) return null;

  return (
    <>
      <PageHeader
        title={`Roll #${header.numero}`}
        description={`${header.hoteis?.nome ?? ""}${header.prestadoras?.nome ? " • " + header.prestadoras.nome : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link to="/operacao/roll-alyani"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <Button size="sm" onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending}><Save className="h-4 w-4 mr-1" /> Salvar cabeçalho</Button>
          </>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div><Label>Nº do Roll</Label><Input value={header.numero ?? ""} onChange={(e) => setHeader({ ...header, numero: e.target.value })} /></div>
        <div><Label>Data do Roll</Label><Input type="date" value={header.data_roll ?? ""} onChange={(e) => setHeader({ ...header, data_roll: e.target.value })} /></div>
        <div><Label>Vencimento</Label><Input type="date" value={header.data_vencimento ?? ""} onChange={(e) => setHeader({ ...header, data_vencimento: e.target.value })} /></div>
        <div><Label>NF / Fatura</Label><Input value={header.nf_fat ?? ""} onChange={(e) => setHeader({ ...header, nf_fat: e.target.value })} /></div>
        <div className="md:col-span-2">
          <Label>Prestadora</Label>
          <Select value={header.prestadora_id ?? ""} onValueChange={(v) => setHeader({ ...header, prestadora_id: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{(prestadoras as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 rounded-md border p-2"><Switch checked={!!header.expresso} onCheckedChange={(v) => setHeader({ ...header, expresso: v })} /><span className="text-sm">Expresso</span></div>
        <div className="flex items-center gap-3 rounded-md border p-2"><Switch checked={!!header.cobrada} onCheckedChange={(v) => setHeader({ ...header, cobrada: v })} /><span className="text-sm">Cobrada</span></div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Itens do Roll</span>
          <span className="text-xs text-muted-foreground">Preços e custos vêm automaticamente das tabelas vigentes na data do roll.</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Peça</th>
              <th className="text-right px-4 py-2 font-medium w-24">Qtd</th>
              <th className="text-center px-4 py-2 font-medium w-20">Exp</th>
              <th className="text-right px-4 py-2 font-medium w-28">Vlr Unit</th>
              <th className="text-right px-4 py-2 font-medium w-28">Total</th>
              <th className="text-right px-4 py-2 font-medium w-28">Custo</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it: any) => (
              <ItemRow key={it.id} it={it} pecas={pecas as any[]} onSave={(u) => upsertItem.mutate({ ...u, id: it.id })} onRemove={() => removeItem.mutate(it.id)} />
            ))}
            <tr className="border-t bg-muted/20">
              <td className="px-2 py-1">
                <Select value={novoItem.peca_id} onValueChange={(v) => setNovoItem({ ...novoItem, peca_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione a peça…" /></SelectTrigger>
                  <SelectContent>{(pecas as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-2 py-1"><Input className="h-8 text-right font-mono" type="number" min={0} step="1" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: Number(e.target.value) })} /></td>
              <td className="px-2 py-1 text-center"><Switch checked={novoItem.expresso_item} onCheckedChange={(v) => setNovoItem({ ...novoItem, expresso_item: v })} /></td>
              <td colSpan={3}></td>
              <td className="px-2 py-1 text-right">
                <Button size="icon" variant="ghost" disabled={!novoItem.peca_id || novoItem.quantidade <= 0}
                  onClick={() => { upsertItem.mutate(novoItem); setNovoItem({ peca_id: "", quantidade: 1, expresso_item: false }); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          </tbody>
          <tfoot className="bg-muted/30 font-medium">
            <tr>
              <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Totais</td>
              <td className="px-4 py-2 text-right font-mono">{totais.qtd}</td>
              <td></td>
              <td></td>
              <td className="px-4 py-2 text-right font-mono">{brl(totais.receita)}</td>
              <td className="px-4 py-2 text-right font-mono">{brl(totais.custo)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Receita</div><div className="text-xl font-semibold mt-1">{brl(header.total_receita)}</div></div>
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Custo</div><div className="text-xl font-semibold mt-1">{brl(header.total_custo)}</div></div>
        <div className="rounded-md border bg-card p-4"><div className="text-[11px] uppercase text-muted-foreground">Lucro</div><div className="text-xl font-semibold mt-1">{brl(header.total_lucro)}</div></div>
      </div>
    </>
  );
}

function ItemRow({ it, pecas, onSave, onRemove }: { it: any; pecas: any[]; onSave: (i: Item) => void; onRemove: () => void }) {
  const [local, setLocal] = useState<Item>({ peca_id: it.peca_id, quantidade: Number(it.quantidade), expresso_item: !!it.expresso_item });
  const dirty = local.peca_id !== it.peca_id || local.quantidade !== Number(it.quantidade) || local.expresso_item !== !!it.expresso_item;

  // When peça is changed, immediately save
  const handlePecaChange = (v: string) => {
    const newLocal = { ...local, peca_id: v };
    setLocal(newLocal);
    onSave(newLocal);
  };

  return (
    <tr className="border-t">
      <td className="px-2 py-1">
        <Select value={local.peca_id} onValueChange={handlePecaChange}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{pecas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1"><Input className="h-8 text-right font-mono" type="number" min={0} value={local.quantidade}
        onChange={(e) => setLocal({ ...local, quantidade: Number(e.target.value) })}
        onBlur={() => dirty && onSave(local)} /></td>
      <td className="px-2 py-1 text-center"><Switch checked={local.expresso_item} onCheckedChange={(v) => { setLocal({ ...local, expresso_item: v }); onSave({ ...local, expresso_item: v }); }} /></td>
      <td className="px-4 py-1 text-right font-mono text-muted-foreground">{brl(it.valor_unit)}</td>
      <td className="px-4 py-1 text-right font-mono">{brl(it.valor_total)}</td>
      <td className="px-4 py-1 text-right font-mono text-muted-foreground">{brl(it.custo_total)}</td>
      <td className="px-1 py-1 text-right">
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </td>
    </tr>
  );
}