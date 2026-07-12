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
import { Save, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tabelas/custos")({
  head: () => ({ meta: [{ title: "Tabela de Custos — Alyani" }] }),
  component: Page,
});

type Row = { pecaId: string; nome: string; valor: number; existingId?: string };

function Page() {
  const qc = useQueryClient();
  const [prestadoraId, setPrestadoraId] = useState<string>("");
  const [vigencia, setVigencia] = useState<string>(isoDate());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  const { data: prestadoras = [] } = useQuery({
    queryKey: ["prestadoras-lite"],
    queryFn: async () => (await supabase.from("prestadoras").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: pecas = [] } = useQuery({
    queryKey: ["pecas-lite"],
    queryFn: async () => (await supabase.from("pecas").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: custos = [] } = useQuery({
    queryKey: ["tabela-custos", prestadoraId],
    enabled: !!prestadoraId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tabela_custos")
        .select("*")
        .eq("prestadora_id", prestadoraId)
        .order("data_vigencia", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!pecas.length) return;
    const latest = new Map<string, any>();
    for (const c of custos as any[]) {
      if (c.data_vigencia > vigencia) continue;
      if (!latest.has(c.peca_id)) latest.set(c.peca_id, c);
    }
    const exact = new Map<string, any>();
    for (const c of custos as any[]) {
      if (c.data_vigencia === vigencia) exact.set(c.peca_id, c);
    }
    setRows(
      (pecas as any[]).map((p) => ({
        pecaId: p.id,
        nome: p.nome,
        valor: Number(latest.get(p.id)?.valor ?? 0),
        existingId: exact.get(p.id)?.id,
      }))
    );
  }, [pecas, custos, vigencia]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const lower = searchTerm.toLowerCase().trim();
    return rows.filter((row) => row.nome.toLowerCase().includes(lower));
  }, [rows, searchTerm]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = filteredRows.map((row) => {
        const item: any = {
          prestadora_id: prestadoraId,
          peca_id: row.pecaId,
          valor: row.valor,
          data_vigencia: vigencia,
          status: "ativo",
        };
        if (row.existingId) {
          item.id = row.existingId;
        }
        return item;
      });
      const { error } = await supabase.from("tabela_custos").upsert(payload as any, {
        onConflict: "prestadora_id,peca_id,data_vigencia",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custos salvos e rolls atualizados!");
      qc.invalidateQueries({ queryKey: ["tabela-custos"] });
      qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      qc.invalidateQueries({ queryKey: ["roll"] });
      qc.invalidateQueries({ queryKey: ["roll-itens"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader
        title="Tabela de Custos"
        description="Custos pagos às prestadoras. O sistema usa a vigência mais recente até a data do roll."
        actions={
          <Button
            size="sm"
            disabled={!prestadoraId || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="h-4 w-4 mr-1" /> Salvar vigência
          </Button>
        }
      />
      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Prestadora
          </Label>
          <Select value={prestadoraId} onValueChange={setPrestadoraId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione uma prestadora…" />
            </SelectTrigger>
            <SelectContent>
              {(prestadoras as any[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data de vigência
          </Label>
          <Input
            type="date"
            className="h-9 w-[160px]"
            value={vigencia}
            onChange={(e) => setVigencia(e.target.value)}
          />
        </div>
        {prestadoraId && (
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Buscar
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Digite para pesquisar…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
      {!prestadoraId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">
          Selecione uma prestadora para editar os custos.
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Peça</th>
                <th className="text-right px-4 py-2 font-medium w-40">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.pecaId} className="border-t">
                  <td className="px-4 py-1.5">{row.nome}</td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-8 text-right font-mono"
                      value={row.valor}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.pecaId === row.pecaId ? { ...r, valor: Number(e.target.value) } : r
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  Total de peças: {filteredRows.length}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  Σ {brlNumber(filteredRows.reduce((s, r) => s + r.valor, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
