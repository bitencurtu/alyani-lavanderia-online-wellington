import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cadastros/pecas")({
  head: () => ({ meta: [{ title: "Peças — Alyani" }] }),
  component: Page,
});

type Peca = { id: string; nome: string; status: "ativo" | "inativo" };
type PecaForm = { id?: string; nome: string; status: "ativo" | "inativo" };

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PecaForm | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["pecas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pecas").select("*").order("nome");
      if (error) throw error;
      return data as Peca[];
    },
  });

  const rows = useMemo(() => {
    const q = (filters.q ?? "").toLowerCase().trim();
    return data.filter((p) => p.status === "ativo" && (!q || p.nome.toLowerCase().includes(q)));
  }, [data, filters.q]);

  const save = useMutation({
    mutationFn: async (h: Partial<PecaForm>) => {
  const nome = h.nome?.trim();

  if (!nome) {
    throw new Error("Informe o nome da peça.");
  }

  // Se estiver editando uma peça existente
  if (h.id && h.id.trim() !== "") {
    const { error } = await supabase
      .from("pecas")
      .update({
        nome,
        status: h.status,
      })
      .eq("id", h.id);

    if (error) throw error;

    return { reactivatedId: null };
  }

  // Procura uma peça com o mesmo nome, inclusive inativa
  const { data: existingPiece, error: searchError } = await supabase
    .from("pecas")
    .select("id, nome, status")
    .ilike("nome", nome)
    .maybeSingle();

  if (searchError) throw searchError;

  // Se a peça estiver ativa, impede duplicidade
  if (existingPiece?.status === "ativo") {
    throw new Error("Já existe uma peça ativa com esse nome.");
  }

  // Se a peça existir, mas estiver inativa, reativa
  if (existingPiece?.status === "inativo") {
    const { error: reactivateError } = await supabase
      .from("pecas")
      .update({
        nome,
        status: "ativo",
      })
      .eq("id", existingPiece.id);

    if (reactivateError) throw reactivateError;

    // Busca todos os hotéis
    const { data: hotels, error: hotelsError } = await supabase
      .from("hoteis")
      .select("id");

    if (hotelsError) throw hotelsError;

    const today = new Date().toISOString().slice(0, 10);

    // Cria preços zerados a partir da data atual
    if (hotels && hotels.length > 0) {
      const zeroPrices = hotels.map((hotel) => ({
        hotel_id: hotel.id,
        peca_id: existingPiece.id,
        valor_normal: 0,
        valor_expresso: 0,
        data_vigencia: today,
      }));

      const { error: pricesError } = await supabase
        .from("tabela_precos")
        .upsert(zeroPrices as any, {
          onConflict: "hotel_id,peca_id,data_vigencia",
        });

      if (pricesError) throw pricesError;
    }

    return { reactivatedId: existingPiece.id };
  }

  // Se nunca existiu, cria normalmente
  const { error } = await supabase
    .from("pecas")
    .insert({
      nome,
      status: h.status ?? "ativo",
    } as any);

  if (error) throw error;

  return { reactivatedId: null };
},

onSuccess: (result) => {
  if (result.reactivatedId) {
    toast.success("Peça reativada com os valores zerados.");
  } else {
    toast.success("Peça salva.");
  }

  qc.invalidateQueries({ queryKey: ["pecas"] });
  qc.invalidateQueries({ queryKey: ["pecas-lite"] });
  qc.invalidateQueries({ queryKey: ["precos"] });

  setOpen(false);
  setEditing(null);
},

onError: (e: any) => toast.error(e.message),});

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { data: updated, error } = await supabase
        .from("pecas")
        .update({ status: "inativo" })
        .eq("id", id)
        .select("id,status")
        .single();

      if (error) throw error;
      if (!updated || updated.status !== "inativo") {
        throw new Error("Não foi possível excluir a peça.");
      }
    },
    onSuccess: async () => {
      // A exclusão é lógica (status=inativo). Isso preserva o histórico dos ROLs,
      // mas remove a peça de todos os seletores que carregam somente peças ativas.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pecas"] }),
        qc.invalidateQueries({ queryKey: ["pecas-lite"] }),
        qc.invalidateQueries({ queryKey: ["precos"] }),
      ]);
      toast.success("Peça excluída.");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir a peça."),
  });

  return (
    <>
      <PageHeader title="Peças" description="Catálogo de peças (roupas de cama, banho, etc)."
        actions={<Button size="sm" onClick={() => { setEditing({ nome: "", status: "ativo" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Nova peça</Button>} />
      <FilterBar value={filters} onChange={(p) => setFilters((f) => ({ ...f, ...p }))} showPeriodo={false} onClear={() => setFilters({})} />

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr><th className="text-left px-4 py-2 font-medium">Nome</th><th className="text-left px-4 py-2 font-medium">Status</th><th className="w-10"></th></tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{h.nome}</td>
                <td className="px-4 py-2"><span className={h.status === "ativo" ? "text-success text-xs font-medium" : "text-muted-foreground text-xs"}>{h.status}</span></td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(h); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deactivate.isPending}
                    onClick={() => {
                      if (confirm(`Tem certeza que deseja excluir a peça "${h.nome}"?`)) {
                        deactivate.mutate(h.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nenhuma peça cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar peça" : "Nova peça"}</DialogTitle></DialogHeader>
          {editing && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
              <div><Label>Nome</Label><Input required value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></div>
              <div><Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                </Select>
              </div>
              <DialogFooter>
                {editing?.id && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deactivate.isPending}
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir esta peça?") && editing.id) {
                        deactivate.mutate(editing.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
