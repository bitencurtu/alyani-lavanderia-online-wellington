import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brDate, brlNumber, isoDate } from "@/lib/format";
import {
  calcularValorExpressoAutomatico,
  correspondeAoTipoDePrecoAlterado,
  usaPrecoExpresso,
  type TiposPrecoAlterados,
} from "@/lib/preco-expresso";
import { Save, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tabelas/precos")({
  head: () => ({ meta: [{ title: "Tabela de Preços — Alyani" }] }),
  component: Page,
});

type Row = {
  peca_id: string;
  nome: string;
  valor_normal: number;
  valor_expresso: number;
  existing_id?: string;
};

type PriceUpdate = Row & TiposPrecoAlterados;

type RollItem = {
  id: string;
  peca_id: string;
  valor_unit: number;
  expresso_item: boolean;
};

type RollOption = {
  id: string;
  numero: string;
  data_roll: string;
  expresso: boolean;
  rolls_alyani_itens: RollItem[];
};

function Page() {
  const qc = useQueryClient();
  const [hotelId, setHotelId] = useState("");
  const [vigencia, setVigencia] = useState(isoDate());
  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [originalRows, setOriginalRows] = useState<Row[]>([]);

  const [priceUpdateQueue, setPriceUpdateQueue] = useState<PriceUpdate[]>([]);
  const [priceUpdateIndex, setPriceUpdateIndex] = useState(0);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [rollSearch, setRollSearch] = useState("");
  const [rollStartDate, setRollStartDate] = useState("");
  const [rollEndDate, setRollEndDate] = useState("");

  const { data: hoteisData } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hoteis")
        .select("id,nome")
        .eq("status", "ativo")
        .order("nome");
      return data ?? [];
    },
  });

  const { data: pecasData } = useQuery({
    queryKey: ["pecas-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pecas")
        .select("id,nome")
        .eq("status", "ativo")
        .order("nome");
      return data ?? [];
    },
  });

  const { data: precosData } = useQuery({
    queryKey: ["precos", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tabela_precos")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("data_vigencia", { ascending: false });
      return data ?? [];
    },
  });

  const hoteis = useMemo(() => hoteisData ?? [], [hoteisData]);
  const pecas = useMemo(() => pecasData ?? [], [pecasData]);
  const precos = useMemo(() => precosData ?? [], [precosData]);

  useEffect(() => {
    if (!pecas.length) return;

    const latest = new Map<string, any>();
    for (const price of precos as any[]) {
      if (price.data_vigencia > vigencia) continue;
      if (!latest.has(price.peca_id)) latest.set(price.peca_id, price);
    }

    const exact = new Map<string, any>();
    for (const price of precos as any[]) {
      if (price.data_vigencia === vigencia) exact.set(price.peca_id, price);
    }

    const nextRows = (pecas as any[]).map((piece) => {
      const source = exact.get(piece.id) ?? latest.get(piece.id);
      return {
        peca_id: piece.id,
        nome: piece.nome,
        valor_normal: Number(source?.valor_normal ?? 0),
        valor_expresso:
          source?.valor_expresso === null || source?.valor_expresso === undefined
            ? calcularValorExpressoAutomatico(Number(source?.valor_normal ?? 0))
            : Number(source.valor_expresso),
        existing_id: exact.get(piece.id)?.id,
      };
    });

    setRows(nextRows);
    setOriginalRows(nextRows);
  }, [pecas, precos, vigencia]);

  const originalByPiece = useMemo(
    () => new Map(originalRows.map((row) => [row.peca_id, row])),
    [originalRows],
  );

  const changedRows = useMemo<PriceUpdate[]>(
    () =>
      rows.flatMap((row) => {
        const original = originalByPiece.get(row.peca_id);
        const normalAlterado = !original || row.valor_normal !== original.valor_normal;
        const expressoAlterado = !original || row.valor_expresso !== original.valor_expresso;

        return normalAlterado || expressoAlterado
          ? [{ ...row, normalAlterado, expressoAlterado }]
          : [];
      }),
    [rows, originalByPiece],
  );

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const search = searchTerm.toLowerCase().trim();
    return rows.filter((row) => row.nome.toLowerCase().includes(search));
  }, [rows, searchTerm]);

  const save = useMutation({
    mutationFn: async ({ changed }: { changed: PriceUpdate[] }) => {
      const invalidRow = rows.find(
        (row) =>
          !Number.isFinite(row.valor_normal) ||
          !Number.isFinite(row.valor_expresso) ||
          row.valor_normal < 0 ||
          row.valor_expresso < 0,
      );
      if (invalidRow) {
        throw new Error(`Informe valores válidos e não negativos para ${invalidRow.nome}.`);
      }

      const rowsToSave = changed.length > 0 ? changed : rows;
      const payload = rowsToSave.map((row) => {
        const item: any = {
          hotel_id: hotelId,
          peca_id: row.peca_id,
          valor_normal: row.valor_normal,
          valor_expresso: row.valor_expresso,
          data_vigencia: vigencia,
          status: "ativo",
        };
        return item;
      });

      const { error } = await supabase
        .from("tabela_precos")
        .upsert(payload as any, { onConflict: "hotel_id,peca_id,data_vigencia" });
      if (error) throw error;

      const changedWithRolls: PriceUpdate[] = [];

      for (const changedRow of changed) {
        const { data: matchingRolls, error: rollsError } = await supabase
          .from("rolls_alyani")
          .select("id,expresso,rolls_alyani_itens!inner(peca_id,expresso_item)")
          .eq("hotel_id", hotelId)
          .eq("rolls_alyani_itens.peca_id", changedRow.peca_id);

        if (rollsError) throw rollsError;
        const hasMatchingRoll = (matchingRolls ?? []).some((roll: any) =>
          (roll.rolls_alyani_itens ?? []).some((item: any) =>
            correspondeAoTipoDePrecoAlterado(
              Boolean(roll.expresso),
              Boolean(item.expresso_item),
              changedRow,
            ),
          ),
        );
        if (hasMatchingRoll) changedWithRolls.push(changedRow);
      }

      return { changed, changedWithRolls };
    },
    onSuccess: async ({ changed, changedWithRolls }) => {
      await qc.invalidateQueries({ queryKey: ["precos", hotelId] });
      await qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      await qc.invalidateQueries({ queryKey: ["roll"] });
      await qc.invalidateQueries({ queryKey: ["roll-itens"] });

      if (changedWithRolls.length > 0) {
        setPriceUpdateQueue(changedWithRolls);
        setPriceUpdateIndex(0);
        setSelectedRollIds(new Set());
        setRollSearch("");
        setRollStartDate("");
        setRollEndDate("");
        toast.success("Preço salvo.");
      } else if (changed.length > 0) {
        toast.success("Preço salvo. Esta peça ainda não aparece em nenhum roll.");
      } else {
        toast.success("Preços salvos!");
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  const currentPriceChange = priceUpdateQueue[priceUpdateIndex] ?? null;
  const currentPriceTypeLabel = currentPriceChange?.normalAlterado
    ? currentPriceChange.expressoAlterado
      ? "normal e expresso"
      : "normal"
    : "expresso";

  const { data: candidateRolls = [], isLoading: loadingRolls } = useQuery({
    queryKey: ["rolls-para-alterar-preco", hotelId, currentPriceChange?.peca_id],
    enabled: !!hotelId && !!currentPriceChange,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolls_alyani")
        .select(
          "id,numero,data_roll,expresso,rolls_alyani_itens!inner(id,valor_unit,peca_id,expresso_item)",
        )
        .eq("hotel_id", hotelId)
        .eq("rolls_alyani_itens.peca_id", currentPriceChange!.peca_id)
        .order("data_roll", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as RollOption[];
    },
  });

  const eligibleRolls = useMemo(() => {
    if (!currentPriceChange) return [];
    return candidateRolls.filter((roll) =>
      roll.rolls_alyani_itens.some((item) =>
        correspondeAoTipoDePrecoAlterado(
          Boolean(roll.expresso),
          Boolean(item.expresso_item),
          currentPriceChange,
        ),
      ),
    );
  }, [candidateRolls, currentPriceChange]);

  const filteredRolls = useMemo(() => {
    const search = rollSearch.toLowerCase().trim();
    return eligibleRolls.filter((roll) => {
      if (search && !roll.numero.toLowerCase().includes(search)) return false;
      if (rollStartDate && roll.data_roll < rollStartDate) return false;
      if (rollEndDate && roll.data_roll > rollEndDate) return false;
      return true;
    });
  }, [eligibleRolls, rollSearch, rollStartDate, rollEndDate]);

  const advancePriceUpdate = () => {
    setSelectedRollIds(new Set());
    setRollSearch("");
    setRollStartDate("");
    setRollEndDate("");

    if (priceUpdateIndex + 1 < priceUpdateQueue.length) {
      setPriceUpdateIndex((index) => index + 1);
    } else {
      setPriceUpdateQueue([]);
      setPriceUpdateIndex(0);
    }
  };

  const openPriceUpdateForRow = (row: Row) => {
    setPriceUpdateQueue([
      {
        ...row,
        normalAlterado: true,
        expressoAlterado: true,
      },
    ]);
    setPriceUpdateIndex(0);
    setSelectedRollIds(new Set());
    setRollSearch("");
    setRollStartDate("");
    setRollEndDate("");
  };

  const applyPriceToRolls = useMutation({
    mutationFn: async () => {
      if (!currentPriceChange) return;

      const selectedRolls = eligibleRolls.filter((roll) => selectedRollIds.has(roll.id));
      const normalItemIds: string[] = [];
      const expressItemIds: string[] = [];

      for (const roll of selectedRolls) {
        for (const item of roll.rolls_alyani_itens) {
          if (
            !correspondeAoTipoDePrecoAlterado(
              Boolean(roll.expresso),
              Boolean(item.expresso_item),
              currentPriceChange,
            )
          ) {
            continue;
          }

          if (usaPrecoExpresso(Boolean(roll.expresso), Boolean(item.expresso_item))) {
            expressItemIds.push(item.id);
          } else {
            normalItemIds.push(item.id);
          }
        }
      }

      if (normalItemIds.length > 0) {
        const { error } = await supabase
          .from("rolls_alyani_itens")
          .update({
            valor_unit: currentPriceChange.valor_normal,
            preco_manual: true,
          } as any)
          .in("id", normalItemIds);
        if (error) throw error;
      }

      if (expressItemIds.length > 0) {
        const { error } = await supabase
          .from("rolls_alyani_itens")
          .update({
            valor_unit: currentPriceChange.valor_expresso,
            preco_manual: true,
          } as any)
          .in("id", expressItemIds);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(`${selectedRollIds.size} roll(s) atualizado(s).`);
      await qc.invalidateQueries({ queryKey: ["rolls_alyani"] });
      await qc.invalidateQueries({ queryKey: ["roll"] });
      await qc.invalidateQueries({ queryKey: ["roll-itens"] });
      await qc.invalidateQueries({ queryKey: ["rel-financeiro"] });
      await qc.invalidateQueries({ queryKey: ["rel-hotel"] });
      await qc.invalidateQueries({ queryKey: ["rel-cliente"] });
      await qc.invalidateQueries({ queryKey: ["cobrancas"] });
      await qc.invalidateQueries({ queryKey: ["rolls-para-alterar-preco"] });
      advancePriceUpdate();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleSave = () => {
    const pieceCount = changedRows.length;
    const confirmation =
      pieceCount === 0
        ? "Salvar esta vigência de preços?"
        : `Salvar a alteração de preço de ${pieceCount} peça(s)?`;

    if (window.confirm(confirmation)) save.mutate({ changed: changedRows });
  };

  const toggleRoll = (rollId: string, checked: boolean) => {
    setSelectedRollIds((current) => {
      const next = new Set(current);
      if (checked) next.add(rollId);
      else next.delete(rollId);
      return next;
    });
  };

  const allVisibleSelected =
    filteredRolls.length > 0 && filteredRolls.every((roll) => selectedRollIds.has(roll.id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedRollIds((current) => {
      const next = new Set(current);
      for (const roll of filteredRolls) {
        if (checked) next.add(roll.id);
        else next.delete(roll.id);
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Tabela de Preços"
        description="Preços por hotel. O sistema usa a vigência mais recente até a data do roll."
        actions={
          <Button size="sm" disabled={!hotelId || save.isPending} onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" /> Salvar vigência
          </Button>
        }
      />

      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Hotel
          </Label>
          <Select value={hotelId} onValueChange={setHotelId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione um hotel…" />
            </SelectTrigger>
            <SelectContent>
              {(hoteis as any[]).map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  {hotel.nome}
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
            onChange={(event) => setVigencia(event.target.value)}
          />
        </div>

        {hotelId && (
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
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {!hotelId ? (
        <div className="border rounded-md p-10 text-center text-muted-foreground bg-card text-sm">
          Selecione um hotel para editar os preços.
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Peça</th>
                <th className="text-right px-4 py-2 font-medium w-40">Valor normal</th>
                <th className="text-right px-4 py-2 font-medium w-40">Valor expresso (2×)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.peca_id} className="border-t">
                  <td className="px-4 py-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span>{row.nome}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0"
                        disabled={
                          row.valor_normal !== originalByPiece.get(row.peca_id)?.valor_normal ||
                          row.valor_expresso !== originalByPiece.get(row.peca_id)?.valor_expresso
                        }
                        onClick={() => openPriceUpdateForRow(row)}
                      >
                        Aplicar nos rolls
                      </Button>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-8 text-right font-mono"
                      value={row.valor_normal}
                      onChange={(event) => {
                        const valorNormal = Number(event.target.value);
                        setRows((current) =>
                          current.map((item) =>
                            item.peca_id === row.peca_id
                              ? {
                                  ...item,
                                  valor_normal: valorNormal,
                                  valor_expresso: calcularValorExpressoAutomatico(valorNormal),
                                }
                              : item,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-8 text-right font-mono"
                      value={row.valor_expresso}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.peca_id === row.peca_id
                              ? { ...item, valor_expresso: Number(event.target.value) }
                              : item,
                          ),
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
                  Σ {brlNumber(filteredRows.reduce((sum, row) => sum + row.valor_normal, 0))}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  Σ {brlNumber(filteredRows.reduce((sum, row) => sum + row.valor_expresso, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog
        open={!!currentPriceChange}
        onOpenChange={(open) => {
          if (!open && !applyPriceToRolls.isPending) {
            setPriceUpdateQueue([]);
            setPriceUpdateIndex(0);
            setSelectedRollIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Atualizar preço nos rolls?</DialogTitle>
            <DialogDescription>
              Você gostaria de alterar o preço <strong>{currentPriceTypeLabel}</strong> de{" "}
              <strong>{currentPriceChange?.nome}</strong> em algum roll deste hotel? Somente os
              rolls compatíveis com o tipo de preço alterado aparecem abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Pesquisar roll</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Número do roll…"
                  value={rollSearch}
                  onChange={(event) => setRollSearch(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Data inicial</Label>
              <Input
                type="date"
                value={rollStartDate}
                onChange={(event) => setRollStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label>Data final</Label>
              <Input
                type="date"
                value={rollEndDate}
                onChange={(event) => setRollEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border overflow-auto max-h-[50vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted z-10 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-2">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(value) => toggleAllVisible(value === true)}
                    />
                  </th>
                  <th className="text-left px-4 py-2">Roll</th>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-right px-4 py-2">Preço atual</th>
                  <th className="text-right px-4 py-2">Novo preço</th>
                </tr>
              </thead>
              <tbody>
                {loadingRolls ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Carregando rolls…
                    </td>
                  </tr>
                ) : filteredRolls.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum roll encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredRolls.map((roll) => {
                    const relevantItems = roll.rolls_alyani_itens.filter((item) =>
                      correspondeAoTipoDePrecoAlterado(
                        Boolean(roll.expresso),
                        Boolean(item.expresso_item),
                        currentPriceChange!,
                      ),
                    );
                    const hasExpressItem = relevantItems.some((item) =>
                      usaPrecoExpresso(Boolean(roll.expresso), Boolean(item.expresso_item)),
                    );
                    const hasNormalItem = relevantItems.some(
                      (item) =>
                        !usaPrecoExpresso(Boolean(roll.expresso), Boolean(item.expresso_item)),
                    );
                    const currentValues = Array.from(
                      new Set(relevantItems.map((item) => Number(item.valor_unit ?? 0))),
                    );
                    const newValues = [
                      ...(hasNormalItem && currentPriceChange?.normalAlterado
                        ? [currentPriceChange.valor_normal]
                        : []),
                      ...(hasExpressItem && currentPriceChange?.expressoAlterado
                        ? [currentPriceChange.valor_expresso]
                        : []),
                    ].filter((value, index, values) => values.indexOf(value) === index);
                    const rollType =
                      hasExpressItem && hasNormalItem
                        ? "Misto"
                        : hasExpressItem
                          ? "Expresso"
                          : "Normal";

                    return (
                      <tr key={roll.id} className="border-t">
                        <td className="px-4 py-2">
                          <Checkbox
                            checked={selectedRollIds.has(roll.id)}
                            onCheckedChange={(value) => toggleRoll(roll.id, value === true)}
                          />
                        </td>
                        <td className="px-4 py-2 font-mono">{roll.numero}</td>
                        <td className="px-4 py-2">{brDate(roll.data_roll)}</td>
                        <td className="px-4 py-2">{rollType}</td>
                        <td className="px-4 py-2 text-right font-mono">
                          {currentValues.map((value) => `R$ ${brlNumber(value)}`).join(" / ")}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {newValues.map((value) => `R$ ${brlNumber(value)}`).join(" / ")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground">
            {selectedRollIds.size} roll(s) selecionado(s).
          </div>

          <DialogFooter>
            <Button
              variant={selectedRollIds.size > 0 ? "default" : "destructive"}
              disabled={applyPriceToRolls.isPending}
              onClick={() => {
                if (selectedRollIds.size > 0) applyPriceToRolls.mutate();
                else advancePriceUpdate();
              }}
            >
              {applyPriceToRolls.isPending
                ? "Alterando…"
                : selectedRollIds.size > 0
                  ? `Alterar ${selectedRollIds.size} roll(s)`
                  : "Pular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
