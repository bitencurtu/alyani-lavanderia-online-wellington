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
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { invalidatePecas } from "@/lib/query-cache";

export const Route = createFileRoute("/_authenticated/cadastros/pecas")({
  head: () => ({ meta: [{ title: "Peças — Alyani" }] }),
  component: Page,
});

type Peca = { id: string; nome: string; status: "ativo" | "inativo" };
type PecaForm = { id?: string; nome: string; status: "ativo" | "inativo" };
type ViewMode = "ativas" | "inativas" | "todas";

function Page() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({});
  const [viewMode, setViewMode] = useState<ViewMode>("ativas");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PecaForm | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["pecas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pecas").select("id,nome,status").order("nome");
      if (error) throw error;
      return (data ?? []) as Peca[];
    },
  });

  const rows = useMemo(() => {
    const q = (filters.q ?? "").toLowerCase().trim();
    return data.filter((p) => {
      if (viewMode === "ativas" && p.status !== "ativo") return false;
      if (viewMode === "inativas" && p.status !== "inativo") return false;
      return !q || p.nome.toLowerCase().includes(q);
    });
  }, [data, filters.q, viewMode]);



  const save = useMutation({
    mutationFn: async (form: PecaForm) => {
      const nome = form.nome.trim();
      if (!nome) throw new Error("Informe o nome da peça.");

      const { data: sameName, error: lookupError } = await supabase
        .from("pecas")
        .select("id,nome,status")
        .ilike("nome", nome)
        .limit(10);
      if (lookupError) throw lookupError;

      const duplicate = (sameName ?? []).find(
        (p) => p.id !== form.id && p.nome.trim().toLocaleLowerCase() === nome.toLocaleLowerCase(),
      );

      if (form.id) {
        if (duplicate?.status === "ativo") {
          throw new Error("Já existe uma peça ativa com esse nome.");
        }
        if (duplicate?.status === "inativo") {
          throw new Error("Já existe uma peça inativa com esse nome. Reative aquela peça em vez de criar uma duplicata.");
        }

        const { data: updated, error } = await supabase
          .from("pecas")
          .update({ nome, status: form.status })
          .eq("id", form.id)
          .select("id,status")
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error("A peça não foi atualizada no banco.");
        return { reactivated: false };
      }

      if (duplicate?.status === "ativo") {
        throw new Error("Já existe uma peça ativa com esse nome.");
      }

      if (duplicate?.status === "inativo") {
        const { data: reactivated, error } = await supabase
          .from("pecas")
          .update({ nome, status: "ativo" })
          .eq("id", duplicate.id)
          .select("id,status")
          .maybeSingle();
        if (error) throw error;
        if (!reactivated) throw new Error("A peça não foi reativada no banco.");
        return { reactivated: true };
      }

      const { data: inserted, error } = await supabase
        .from("pecas")
        .insert({ nome, status: "ativo" } as any)
        .select("id,status")
        .maybeSingle();
      if (error) throw error;
      if (!inserted) throw new Error("A peça não foi criada no banco.");
      return { reactivated: false };
    },
    onSuccess: async (result) => {
      await invalidatePecas(qc);
      toast.success(result.reactivated ? "Peça reativada. Os preços históricos foram preservados." : "Peça salva.");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "ativo" | "inativo" }) => {
      const { data: updated, error } = await supabase
        .from("pecas")
        .update({ status })
        .eq("id", id)
        .select("id,status")
        .maybeSingle();
      if (error) throw error;
      if (!updated || updated.status !== status) {
        throw new Error("A alteração não foi confirmada pelo banco.");
      }
    },
    onSuccess: async (_, vars) => {
      await invalidatePecas(qc);
      toast.success(vars.status === "inativo" ? "Peça removida das novas seleções." : "Peça reativada.");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deactivatePiece = (piece: Peca) => {
    if (
      confirm(
        `Tem certeza que deseja excluir a peça "${piece.nome}"?\n\nEla será removida das novas seleções, mas continuará nos Rolls antigos para preservar o histórico.`,
      )
    ) {
      setStatus.mutate({ id: piece.id, status: "inativo" });
    }
  };

  return (
    <>
      <PageHeader
        title="Peças"
        description="Catálogo de peças. Peças excluídas ficam inativas para preservar o histórico dos Rolls."
        actions={
          <Button size="sm" onClick={() => { setEditing({ nome: "", status: "ativo" }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova peça
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterBar
          value={filters}
          onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
          showPeriodo={false}
          onClear={() => setFilters({})}
        />
        <div className="flex rounded-md border p-1 bg-card">
          {(["ativas", "inativas", "todas"] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={viewMode === mode ? "secondary" : "ghost"}
              className="h-7 capitalize"
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((piece) => (
              <tr key={piece.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{piece.nome}</td>
                <td className="px-4 py-2">
                  <span className={piece.status === "ativo" ? "text-success text-xs font-medium" : "text-muted-foreground text-xs"}>
                    {piece.status}
                  </span>
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(piece); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {piece.status === "ativo" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={setStatus.isPending}
                      onClick={() => deactivatePiece(piece)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reativar peça"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: piece.id, status: "ativo" })}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nenhuma peça encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar peça" : "Nova peça"}</DialogTitle></DialogHeader>
          {editing && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
              <div>
                <Label>Nome</Label>
                <Input required value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
              </div>
              {editing.id && (
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as "ativo" | "inativo" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                {editing.id && editing.status === "ativo" && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={setStatus.isPending}
                    onClick={() => deactivatePiece(editing as Peca)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
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
