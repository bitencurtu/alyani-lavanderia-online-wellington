import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar, type FilterState } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cadastros/hoteis")({
  head: () => ({ meta: [{ title: "Hotéis — Alyani" }] }),
  component: HoteisPage,
});

type Hotel = {
  id: string; nome: string; razao_social?: string | null; cnpj?: string | null;
  telefone?: string | null; email?: string | null; endereco?: string | null;
  cep?: string | null; status: "ativo" | "inativo"; observacoes?: string | null;
};

function HoteisPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hotel | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["hoteis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hoteis").select("*").order("nome");
      if (error) throw error;
      return data as Hotel[];
    },
  });

  const rows = useMemo(() => {
    const q = (filters.q ?? "").toLowerCase().trim();
    return data.filter((h) =>
      !q || [h.nome, h.razao_social, h.cnpj, h.email].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [data, filters.q]);

  const save = useMutation({
    mutationFn: async (h: Partial<Hotel>) => {
      const payload = { ...h };
      if (h.id && h.id.trim() !== "") {
        const { error } = await supabase.from("hoteis").update(payload).eq("id", h.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hoteis").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Hotel salvo.");
      qc.invalidateQueries({ queryKey: ["hoteis"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing({ nome: "", status: "ativo" } as any); setOpen(true); };
  const openEdit = (h: Hotel) => { setEditing(h); setOpen(true); };

  return (
    <>
      <PageHeader
        title="Hotéis"
        description="Clientes que enviam as peças para lavagem."
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo hotel
          </Button>
        }
      />
      <FilterBar value={filters} onChange={(p) => setFilters((f) => ({ ...f, ...p }))} showPeriodo={false} onClear={() => setFilters({})} />

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Razão social</th>
              <th className="text-left px-4 py-2 font-medium">CNPJ</th>
              <th className="text-left px-4 py-2 font-medium">Contato</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{h.nome}</td>
                <td className="px-4 py-2 text-muted-foreground">{h.razao_social ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{h.cnpj ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{h.email ?? h.telefone ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={h.status === "ativo" ? "text-success text-xs font-medium" : "text-muted-foreground text-xs"}>{h.status}</span>
                </td>
                <td className="px-2 py-1 text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum hotel cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar hotel" : "Novo hotel"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}
            >
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input required value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Razão social</Label>
                <Input value={editing.razao_social ?? ""} onChange={(e) => setEditing({ ...editing, razao_social: e.target.value })} />
              </div>
              <div><Label>CNPJ</Label>
                <Input value={editing.cnpj ?? ""} onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })} /></div>
              <div><Label>Telefone</Label>
                <Input value={editing.telefone ?? ""} onChange={(e) => setEditing({ ...editing, telefone: e.target.value })} /></div>
              <div className="col-span-2"><Label>E-mail</Label>
                <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="col-span-2"><Label>Endereço</Label>
                <Input value={editing.endereco ?? ""} onChange={(e) => setEditing({ ...editing, endereco: e.target.value })} /></div>
              <div><Label>CEP</Label>
                <Input value={editing.cep ?? ""} onChange={(e) => setEditing({ ...editing, cep: e.target.value })} /></div>
              <div><Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Observações</Label>
                <Input value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} /></div>
              <DialogFooter className="col-span-2 mt-2">
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