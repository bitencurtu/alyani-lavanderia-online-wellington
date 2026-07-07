import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { brl, brDate, firstOfMonth, lastOfMonth, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/operacao/roll-alyani")({
  head: () => ({ meta: [{ title: "Roll Alyani — Alyani" }] }),
  component: Page,
});

type NovoItem = {
  peca_id: string;
  quantidade: number;
  expresso_item: boolean;
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>({ dataInicio: firstOfMonth(), dataFim: lastOfMonth() });
  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState<{ hotel_id: string; prestadora_id: string; numero: string; data_roll: string; data_vencimento: string; expresso: boolean; cobrada: boolean; nf_fat: string }>({
    hotel_id: "", prestadora_id: "", numero: "", data_roll: isoDate(), data_vencimento: "", expresso: false, cobrada: true, nf_fat: "",
  });
  const [novoItens, setNovoItens] = useState<NovoItem[]>([]);

  const { data: hoteis = [] } = useQuery({ queryKey: ["hoteis-lite"], queryFn: async () => (await supabase.from("hoteis").select("id,nome").eq("status", "ativo").order("nome")).data ?? [] });
  const { data: prestadoras = [] } = useQuery({ queryKey: ["prestadoras-lite"], queryFn: async () => (await supabase.from("prestadoras").select("id,nome,is_alyani").eq("status", "ativo").order("nome")).data ?? [] });
  const { data: pecas = [] } = useQuery({ queryKey: ["pecas-lite"], queryFn: async () => (await supabase.from("pecas").select("id,nome").eq("status", "ativo").order("nome")).data ?? [] });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rolls_alyani", filters],
    queryFn: async () => {
      let q = supabase.from("rolls_alyani").select("id, numero, data_roll, data_vencimento, expresso, cobrada, nf_fat, total_receita, total_custo, total_lucro, hoteis(nome), prestadoras(nome)").order("data_roll", { ascending: false });
      if (filters.dataInicio) q = q.gte("data_roll", filters.dataInicio);
      if (filters.dataFim) q = q.lte("data_roll", filters.dataFim);
      if (filters.hotelId) q = q.eq("hotel_id", filters.hotelId);
      if (filters.prestadoraId) q = q.eq("prestadora_id", filters.prestadoraId);
      if (filters.numero) q = q.ilike("numero", `%${filters.numero}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => {
    const s = (filters.q ?? "").toLowerCase().trim();
    if (!s) return rolls;
    return rolls.filter((r: any) => [r.numero, r.hoteis?.nome, r.prestadoras?.nome, r.nf_fat].some((v) => (v ?? "").toString().toLowerCase().includes(s)));
  }, [rolls, filters.q]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        hotel_id: novo.hotel_id,
        prestadora_id: novo.prestadora_id || null,
        numero: novo.numero,
        data_roll: novo.data_roll,
        data_vencimento: novo.data_vencimento || null,
        expresso: novo.expresso,
        cobrada: novo.cobrada,
        nf_fat: novo.nf_fat || null,
      };
      const { data: rollData, error: rollError } = await supabase.from("rolls_alyani").insert(payload as any).select("id").single();
      if (rollError) throw rollError;

      if (novoItens.length > 0) {
        const itemsPayload = novoItens.map(item => ({
          roll_id: rollData.id,
          peca_id: item.peca_id,
          quantidade: item.quantidade,
          expresso_item: item.expresso_item,
        }));
        const { error: itemsError } = await supabase.from("rolls_alyani_itens").insert(itemsPayload as any);
        if (itemsError) throw itemsError;
      }

      return rollData.id as string;
    },
    onSuccess: (id) => {
      toast.success("Roll criado.");
      qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      setOpen(false);
      setNovoItens([]);
      navigate({ to: "/operacao/roll-alyani/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rolls_alyani").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Roll excluído."); qc.invalidateQueries({ queryKey: ["rolls_alyani"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AnimatedPage>
      <PageHeader title="Roll Alyani" description="Registro operacional das peças recebidas dos hotéis."
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Roll</Button>} />

      <FilterBar value={filters} onChange={(p) => setFilters((f) => ({ ...f, ...p }))} showNumero
        onClear={() => setFilters({ dataInicio: undefined, dataFim: undefined, hotelId: undefined, prestadoraId: undefined, numero: undefined })}>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
          <Select value={filters.hotelId ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, hotelId: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todos</SelectItem>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prestadora</Label>
          <Select value={filters.prestadoraId ?? "__all"} onValueChange={(v) => setFilters((f) => ({ ...f, prestadoraId: v === "__all" ? undefined : v }))}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todas</SelectItem>{(prestadoras as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="rounded-md border bg-card overflow-hidden card-hover">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nº</th>
              <th className="text-left px-4 py-2 font-medium">Data</th>
              <th className="text-left px-4 py-2 font-medium">Hotel</th>
              <th className="text-left px-4 py-2 font-medium">Prestadora</th>
              <th className="text-left px-4 py-2 font-medium">NF / Fat</th>
              <th className="text-center px-4 py-2 font-medium">Exp.</th>
              <th className="text-right px-4 py-2 font-medium">Receita</th>
              <th className="text-right px-4 py-2 font-medium">Custo</th>
              <th className="text-right px-4 py-2 font-medium">Lucro</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, index: number) => (
              <tr key={r.id} className="border-t hover:bg-muted/30" style={{ animationDelay: `${index * 30}ms` }}>
                <td className="px-4 py-2 font-mono">{r.numero}</td>
                <td className="px-4 py-2">{brDate(r.data_roll)}</td>
                <td className="px-4 py-2">{r.hoteis?.nome ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.prestadoras?.nome ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.nf_fat ?? "—"}</td>
                <td className="px-4 py-2 text-center">{r.expresso ? <span className="text-warning text-xs font-medium">Exp</span> : "—"}</td>
                <td className="px-4 py-2 text-right font-mono">{brl(r.total_receita)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{brl(r.total_custo)}</td>
                <td className="px-4 py-2 text-right font-mono font-medium">{brl(r.total_lucro)}</td>
                <td className="px-1 py-1 text-right whitespace-nowrap">
                  <Button asChild variant="ghost" size="icon"><Link to="/operacao/roll-alyani/$id" params={{ id: r.id }}><Pencil className="h-4 w-4" /></Link></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir este Roll? Cobranças e pagamentos vinculados serão removidos.")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Nenhum roll no período.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(newOpen) => { 
        setOpen(newOpen);
        if (!newOpen) setNovoItens([]); 
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Novo Roll Alyani</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <Label>Hotel</Label>
                <Select value={novo.hotel_id} onValueChange={(v) => setNovo({ ...novo, hotel_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{(hoteis as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Prestadora</Label>
                <Select value={novo.prestadora_id} onValueChange={(v) => setNovo({ ...novo, prestadora_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{(prestadoras as any[]).map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}{h.is_alyani ? " • Alyani" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Número</Label><Input required value={novo.numero} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} /></div>
              <div><Label>NF / Fatura</Label><Input value={novo.nf_fat} onChange={(e) => setNovo({ ...novo, nf_fat: e.target.value })} /></div>
              <div><Label>Data do Roll</Label><Input type="date" required value={novo.data_roll} onChange={(e) => setNovo({ ...novo, data_roll: e.target.value })} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={novo.data_vencimento} onChange={(e) => setNovo({ ...novo, data_vencimento: e.target.value })} /></div>
              <div className="col-span-2 flex items-center gap-6 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={novo.expresso} onCheckedChange={(v) => setNovo({ ...novo, expresso: v })} /> Expresso</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={novo.cobrada} onCheckedChange={(v) => setNovo({ ...novo, cobrada: v })} /> Cobrada</label>
              </div>
            </div>

            <div className="rounded-md border bg-card overflow-hidden mb-4">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-medium">Itens do Roll</span>
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={() => setNovoItens([...novoItens, { peca_id: "", quantidade: 1, expresso_item: false }])}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Item
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Peça</th>
                    <th className="text-right px-4 py-2 font-medium w-28">Qtd</th>
                    <th className="text-center px-4 py-2 font-medium w-20">Exp</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {novoItens.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">
                        <Select 
                          value={item.peca_id} 
                          onValueChange={(v) => setNovoItens(novoItens.map((it, i) => i === idx ? { ...it, peca_id: v } : it))}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                          <SelectContent>{(pecas as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input 
                          className="h-8 text-right font-mono" 
                          type="number" 
                          min={0} 
                          step="1" 
                          value={item.quantidade} 
                          onChange={(e) => setNovoItens(novoItens.map((it, i) => i === idx ? { ...it, quantidade: Number(e.target.value) } : it))} 
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Switch 
                          checked={item.expresso_item} 
                          onCheckedChange={(v) => setNovoItens(novoItens.map((it, i) => i === idx ? { ...it, expresso_item: v } : it))} 
                        />
                      </td>
                      <td className="px-1 py-1 text-right">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setNovoItens(novoItens.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {novoItens.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum item adicionado</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!novo.hotel_id || !novo.numero || create.isPending}>Criar Roll</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}