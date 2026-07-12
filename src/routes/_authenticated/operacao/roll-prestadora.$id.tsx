import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/operacao/roll-prestadora/$id")({
  head: () => ({ meta: [{ title: "Roll Prestadora — Alyani" }] }),
  component: Page,
});

type Item = {
  id?: string;
  peca_id: string;
  quantidade: number;
};

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: roll, refetch } = useQuery({
    queryKey: ["roll-prestadora", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rolls_prestadora").select("*, prestadoras(nome)").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: itens = [], refetch: refetchItens } = useQuery({
    queryKey: ["roll-prestadora-itens", id],
    queryFn: async () => (await supabase.from("rolls_prestadora_itens").select("*, pecas(nome)").eq("roll_id", id).order("created_at")).data ?? [],
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

  const saveHeader = useMutation({
    mutationFn: async () => {
      const payload = {
        numero: header.numero,
        data_roll: header.data_roll,
        prestadora_id: header.prestadora_id,
      };
      const { error } = await supabase.from("rolls_prestadora").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roll atualizado.");
      qc.invalidateQueries({ queryKey: ["roll-prestadora", id] });
      qc.invalidateQueries({ queryKey: ["rolls_prestadora"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertItem = useMutation({
    mutationFn: async (it: Item) => {
      if (it.id) {
        const { error } = await supabase.from("rolls_prestadora_itens").update({ peca_id: it.peca_id, quantidade: it.quantidade }).eq("id", it.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rolls_prestadora_itens").insert({ roll_id: id, peca_id: it.peca_id, quantidade: it.quantidade } as any);
        if (error) throw error;
      }
    },
    onSuccess: async () => { 
      await refetchItens(); 
      await refetch(); 
      await qc.invalidateQueries({ queryKey: ["rolls_prestadora"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (iid: string) => { const { error } = await supabase.from("rolls_prestadora_itens").delete().eq("id", iid); if (error) throw error; },
    onSuccess: async () => { 
      await refetchItens(); 
      await refetch(); 
      await qc.invalidateQueries({ queryKey: ["rolls_prestadora"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [novoItem, setNovoItem] = useState<Item>({ peca_id: "", quantidade: 1 });

  const totals = useMemo(() => {
    return {
      qtd: itens.reduce((s: number, x: any) => s + Number(x.quantidade ?? 0), 0),
    };
  }, [itens]);

  if (!header) return null;

  return (
    <>
      <PageHeader
        title={`Roll #${header.numero}`}
        description={header.prestadoras?.nome ?? ""}
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link to="/operacao/roll-prestadora"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <Button size="sm" onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending}><Save className="h-4 w-4 mr-1" /> Salvar cabeçalho</Button>
          </>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div><Label>Nº do Roll</Label><Input value={header.numero ?? ""} onChange={(e) => setHeader({ ...header, numero: e.target.value })} /></div>
        <div><Label>Data do Roll</Label><Input type="date" value={header.data_roll ?? ""} onChange={(e) => setHeader({ ...header, data_roll: e.target.value })} /></div>
        <div className="md:col-span-2">
          <Label>Prestadora</Label>
          <Select value={header.prestadora_id ?? ""} onValueChange={(v) => setHeader({ ...header, prestadora_id: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{(prestadoras as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Itens do Roll</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Peça</th>
              <th className="text-right px-4 py-2 font-medium w-32">Qtd</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i: any) => (
              <ItemRow
                key={i.id}
                it={i}
                pecas={pecas as any[]}
                onSave={(itm) => upsertItem.mutate({ ...itm, id: i.id })}
                onRemove={() => removeItem.mutate(i.id)}
              />
            ))}
            <tr className="border-t bg-muted/20">
              <td className="px-2 py-1">
                <Select value={novoItem.peca_id} onValueChange={(v) => setNovoItem({ ...novoItem, peca_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione a peça…" /></SelectTrigger>
                  <SelectContent>{(pecas as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-2 py-1"><Input className="h-8 text-right font-mono" type="number" min={0} step="1" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: Number(e.target.value) })} /></td>
              <td className="px-2 py-1 text-right">
                <Button size="icon" variant="ghost" disabled={!novoItem.peca_id || novoItem.quantidade <= 0} onClick={() => { upsertItem.mutate(novoItem); setNovoItem({ peca_id: "", quantidade: 1 }); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          </tbody>
          <tfoot className="bg-muted/30 font-medium">
            <tr>
              <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Total de peças</td>
              <td className="px-4 py-2 text-right font-mono">{totals.qtd}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ItemRow({ it, pecas, onSave, onRemove }: { it: any; pecas: any[]; onSave: (i: Item) => void; onRemove: () => void }) {
  const [local, setLocal] = useState<Item>({ id: it.id, peca_id: it.peca_id, quantidade: Number(it.quantidade) });
  const dirty = local.peca_id !== it.peca_id || local.quantidade !== Number(it.quantidade);
  return (
    <tr className="border-t">
      <td className="px-2 py-1">
        <Select value={local.peca_id} onValueChange={(v) => setLocal({ ...local, peca_id: v })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{pecas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1"><Input className="h-8 text-right font-mono" type="number" min={0} value={local.quantidade}
        onChange={(e) => setLocal({ ...local, quantidade: Number(e.target.value) })}
        onBlur={() => dirty && onSave(local)} /></td>
      <td className="px-1 py-1 text-right">
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </td>
    </tr>
  );
}
