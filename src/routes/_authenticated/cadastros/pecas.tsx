import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

<<<<<<< HEAD
type Peca = { id?: string; nome: string; status: "ativo" | "inativo" };
=======
type Peca = { id: string; nome: string; status: "ativo" | "inativo" };
type PecaForm = { id?: string; nome: string; status: "ativo" | "inativo" };
>>>>>>> a649a62 (Atualiza relatório de despesas e ajustes do sistema)

function Page() {
  const hiddenKey = "hiddenPecasIds";
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PecaForm | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(hiddenKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.filter((x) => typeof x === "string"));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(hiddenKey);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      setHiddenIds(new Set(arr.filter((x) => typeof x === "string")));
    } catch {}
  }, []);

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
    return data.filter((p) => p.status === "ativo" && !hiddenIds.has(p.id) && (!q || p.nome.toLowerCase().includes(q)));
  }, [data, filters.q, hiddenIds]);

  const save = useMutation({
    mutationFn: async (h: Partial<PecaForm>) => {
      if (h.id && h.id.trim() !== "") {
        const { error } = await supabase.from("pecas").update({ nome: h.nome, status: h.status }).eq("id", h.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pecas").insert({ nome: h.nome, status: h.status } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Peça salva.");
      qc.invalidateQueries({ queryKey: ["pecas"] });
      qc.invalidateQueries({ queryKey: ["pecas-lite"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pecas").update({ status: "inativo" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peça desativada.");
      qc.invalidateQueries({ queryKey: ["pecas"] });
      qc.invalidateQueries({ queryKey: ["pecas-lite"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pecas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Peça excluída."); qc.invalidateQueries({ queryKey: ["pecas"] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
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
                      setHiddenIds((prev) => {
                        const next = new Set(prev);
                        next.add(h.id);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(hiddenKey, JSON.stringify([...next]));
                        }
                        return next;
                      });
                      deactivate.mutate(h.id);
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
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir esta peça?") && editing.id) {
                        remove.mutate(editing.id);
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
