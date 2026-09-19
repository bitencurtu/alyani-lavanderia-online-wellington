import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveHoteis, fetchActivePrestadoras, HOTEIS_LITE_QUERY_KEY, PRESTADORAS_LITE_QUERY_KEY } from "@/lib/catalogos";
import { fetchActivePecas, PECAS_LITE_QUERY_KEY } from "@/lib/pecas";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Check, ChevronsUpDown, Plus, Trash2, Save } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { applyRollItemTotalsDelta, calculateRollItemTotals, removeRollItemTotals } from "@/lib/calculos";

export const Route = createFileRoute("/_authenticated/operacao/roll-alyani/$id")({
  head: () => ({ meta: [{ title: "Roll Alyani — Alyani" }] }),
  component: Page,
});

type Item = {
  id?: string;
  peca_id: string;
  quantidade: number;
  valor_unit?: number;
  valor_total?: number;
  custo_unit?: number;
  custo_total?: number;
  preco_manual?: boolean;
};

const MIN_VENCIMENTO = "2000-01-01";
const MAX_VENCIMENTO = "2100-12-31";

function isValidVencimento(value: string | null | undefined) {
  return !value || (value >= MIN_VENCIMENTO && value <= MAX_VENCIMENTO);
}


function Page() {
  console.log("roll-alyani.$id montado");
  const { id } = Route.useParams();
  console.log("roll-alyani.$id id:", id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: roll } = useQuery({
    queryKey: ["roll", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolls_alyani")
        .select("*, hoteis(nome), prestadoras(nome)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["roll-itens", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolls_alyani_itens")
        .select("*, pecas(nome)")
        .eq("roll_id", id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: pecas = [] } = useQuery({
    queryKey: PECAS_LITE_QUERY_KEY,
    queryFn: fetchActivePecas,
  });
  const { data: hoteis = [] } = useQuery({
    queryKey: HOTEIS_LITE_QUERY_KEY,
    queryFn: fetchActiveHoteis,
  });
  const { data: prestadoras = [] } = useQuery({
    queryKey: PRESTADORAS_LITE_QUERY_KEY,
    queryFn: fetchActivePrestadoras,
  });

  const [header, setHeader] = useState<any>(null);
  useEffect(() => {
    if (roll) setHeader(roll);
  }, [roll]);

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
      if (!isValidVencimento(header.data_vencimento)) {
        throw new Error("O vencimento deve estar entre 01/01/2000 e 31/12/2100.");
      }

      const payload = {
        hotel_id: header.hotel_id,
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
    onSuccess: () => {
      toast.success("Roll atualizado. Itens recalculados.", { duration: 1200 });
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["roll", id] }),
        qc.invalidateQueries({ queryKey: ["roll-itens", id] }),
        qc.invalidateQueries({ queryKey: ["rolls_alyani"] }),
      ]);
      invalidateAllRelatedQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertItem = useMutation({
    mutationFn: async (it: Item) => {
      if (!it.peca_id) throw new Error("Selecione uma peça.");
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
        throw new Error("A quantidade deve ser maior que zero.");
      }

      const previousItem = it.id
        ? (qc.getQueryData<any[]>(["roll-itens", id]) ?? []).find((item) => item.id === it.id)
        : undefined;

      if (it.id) {
        const { data, error } = await supabase
          .from("rolls_alyani_itens")
          .update({
            peca_id: it.peca_id,
            quantidade: it.quantidade,
            preco_manual: it.preco_manual ?? false,
          } as any)
          .eq("id", it.id)
          .select("*, pecas(nome)")
          .single();
        if (error) throw error;
        return { item: data as any, previousItem };
      }

      const { data, error } = await supabase
        .from("rolls_alyani_itens")
        .insert({ roll_id: id, peca_id: it.peca_id, quantidade: it.quantidade } as any)
        .select("*, pecas(nome)")
        .single();
      if (error) throw error;
      return { item: data as any, previousItem: undefined };
    },
    onSuccess: ({ item, previousItem }) => {
      qc.setQueryData<any[]>(["roll-itens", id], (current = []) => {
        if (previousItem?.id) {
          return current.map((existing) => (existing.id === item.id ? item : existing));
        }
        return [...current, item];
      });

      setHeader((prev: any) =>
        prev ? applyRollItemTotalsDelta(prev, previousItem, item) : prev,
      );

      void Promise.all([
        qc.invalidateQueries({ queryKey: ["roll", id] }),
        qc.invalidateQueries({ queryKey: ["roll-itens", id] }),
        qc.invalidateQueries({ queryKey: ["rolls_alyani"] }),
      ]);
      invalidateAllRelatedQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (iid: string) => {
      const { error } = await supabase.from("rolls_alyani_itens").delete().eq("id", iid);
      if (error) throw error;
    },
    onMutate: async (iid) => {
      await qc.cancelQueries({ queryKey: ["roll-itens", id] });
      const previousItems = qc.getQueryData<any[]>(["roll-itens", id]) ?? [];
      const previousHeader = header;
      const removed = previousItems.find((item) => item.id === iid);

      qc.setQueryData<any[]>(["roll-itens", id], (current = []) =>
        current.filter((item) => item.id !== iid),
      );

      if (removed) {
        setHeader((prev: any) => (prev ? removeRollItemTotals(prev, removed) : prev));
      }

      return { previousItems, previousHeader };
    },
    onError: (e: any, _iid, context) => {
      if (context) {
        qc.setQueryData(["roll-itens", id], context.previousItems);
        setHeader(context.previousHeader);
      }
      toast.error(e.message);
    },
    onSettled: () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["roll", id] }),
        qc.invalidateQueries({ queryKey: ["roll-itens", id] }),
        qc.invalidateQueries({ queryKey: ["rolls_alyani"] }),
      ]);
      invalidateAllRelatedQueries();
    },
  });

  const [novoItem, setNovoItem] = useState<Item>({ peca_id: "", quantidade: 1 });
  const novaPecaTriggerRef = useRef<HTMLButtonElement>(null);
  const novaQuantidadeRef = useRef<HTMLInputElement>(null);

  const focusNovaPeca = () => {
    window.setTimeout(() => novaPecaTriggerRef.current?.focus(), 0);
  };

  const handleNovaPecaChange = (pecaId: string) => {
    setNovoItem((prev) => ({ ...prev, peca_id: pecaId }));
    window.setTimeout(() => {
      novaQuantidadeRef.current?.focus();
      novaQuantidadeRef.current?.select();
    }, 0);
  };

  const adicionarNovoItemEContinuar = async () => {
    if (!novoItem.peca_id || novoItem.quantidade <= 0 || upsertItem.isPending) return;

    try {
      await upsertItem.mutateAsync(novoItem);
      setNovoItem({ peca_id: "", quantidade: 1 });
      focusNovaPeca();
    } catch {
      // O erro já é exibido pelo onError da mutation.
    }
  };



  const totais = useMemo(
    () => calculateRollItemTotals(itens as any[]),
    [itens],
  );

  if (!header) return null;

  return (
    <div className="no-hover-motion">
      <PageHeader
        title={`Roll #${header.numero}`}
        description={`${header.hoteis?.nome ?? ""}${header.prestadoras?.nome ? " • " + header.prestadoras.nome : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/operacao/roll-alyani">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Link>
            </Button>
            <Button size="sm" onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending}>
              <Save className="h-4 w-4 mr-1" /> Salvar cabeçalho
            </Button>
          </>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <Label>Nº do Roll</Label>
          <Input
            value={header.numero ?? ""}
            onChange={(e) => setHeader({ ...header, numero: e.target.value })}
          />
        </div>
        <div>
          <Label>Data do Roll</Label>
          <Input
            type="date"
            value={header.data_roll ?? ""}
            onChange={(e) => setHeader({ ...header, data_roll: e.target.value })}
          />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input
            type="date"
            min={MIN_VENCIMENTO}
            max={MAX_VENCIMENTO}
            value={header.data_vencimento ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (isValidVencimento(value)) {
                setHeader({ ...header, data_vencimento: value });
              }
            }}
          />
        </div>
        <div>
          <Label>NF / Fatura</Label>
          <Input
            value={header.nf_fat ?? ""}
            onChange={(e) => setHeader({ ...header, nf_fat: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Hotel</Label>
          <Select
            value={header.hotel_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, hotel_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o hotel…" />
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
        <div className="md:col-span-2">
          <Label>Prestadora</Label>
          <Select
            value={header.prestadora_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, prestadora_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
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
        <div className="flex items-center gap-3 rounded-md border p-2">
          <Switch
            checked={!!header.expresso}
            onCheckedChange={(v) => setHeader({ ...header, expresso: v })}
          />
          <span className="text-sm">EXPRESSO</span>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Itens do Roll</span>
          <span className="text-xs text-muted-foreground">
            Ao adicionar uma peça, o sistema usa os preços e custos vigentes hoje.
          </span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Peça</th>
                <th className="text-right px-4 py-2 font-medium w-24">Qtd</th>
                <th className="text-right px-4 py-2 font-medium w-28">Vlr Unit</th>
                <th className="text-right px-4 py-2 font-medium w-28">Total</th>
                <th className="text-right px-4 py-2 font-medium w-28">Custo</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it: any) => (
                <ItemRow
                  key={it.id}
                  it={it}
                  pecas={pecas as any[]}
                  onSave={(u) =>
                    upsertItem.mutate({
                      ...u,
                      id: it.id,
                      preco_manual: u.peca_id === it.peca_id ? Boolean(it.preco_manual) : false,
                    })
                  }
                  onRemove={() => removeItem.mutate(it.id)}
                />
              ))}
              <tr className="border-t bg-muted/20">
                <td className="px-2 py-1">
                  <SearchablePecaSelect
                    value={novoItem.peca_id}
                    pecas={pecas as any[]}
                    onValueChange={handleNovaPecaChange}
                    triggerRef={novaPecaTriggerRef}
                    placeholder="Selecione a peça…"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    ref={novaQuantidadeRef}
                    className="h-8 text-right font-mono"
                    type="number"
                    min={1}
                    step="1"
                    value={novoItem.quantidade}
                    onChange={(e) =>
                      setNovoItem({ ...novoItem, quantidade: Number(e.target.value) })
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Tab" && !e.shiftKey) ||
                        (e.key === "Enter" && !e.shiftKey)
                      ) {
                        if (!novoItem.peca_id || novoItem.quantidade <= 0) return;
                        e.preventDefault();
                        void adicionarNovoItemEContinuar();
                      }
                    }}
                  />
                </td>
                <td colSpan={3}></td>
                <td className="px-2 py-1 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={
                      !novoItem.peca_id ||
                      novoItem.quantidade <= 0 ||
                      upsertItem.isPending
                    }
                    onClick={() => void adicionarNovoItemEContinuar()}
                    aria-label="Adicionar item e continuar"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Totais
                </td>
                <td className="px-4 py-2 text-right font-mono">{totais.qtd}</td>
                <td></td>
                <td className="px-4 py-2 text-right font-mono">{brl(totais.receita)}</td>
                <td className="px-4 py-2 text-right font-mono">{brl(totais.custo)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Receita</div>
          <div className="text-xl font-semibold mt-1">{brl(header.total_receita)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Custo</div>
          <div className="text-xl font-semibold mt-1">{brl(header.total_custo)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Lucro</div>
          <div className="text-xl font-semibold mt-1">{brl(header.total_lucro)}</div>
        </div>
      </div>
    </div>
  );
}

function SearchablePecaSelect({
  value,
  pecas,
  onValueChange,
  triggerRef,
  placeholder = "Selecione a peça…",
  selectedLabel,
}: {
  value: string;
  pecas: any[];
  onValueChange: (value: string) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  placeholder?: string;
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = pecas.find((p) => p.id === value);

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    internalTriggerRef.current = node;
    if (triggerRef) triggerRef.current = node;
  };

  const focusNextField = () => {
    const trigger = internalTriggerRef.current;
    if (!trigger) return;

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);

    const currentIndex = focusable.indexOf(trigger);
    const next = focusable[currentIndex + 1];
    next?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={setTriggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-3 font-normal"
          onKeyDown={(e) => {
            // Quando o foco chega neste campo pelo Tab, o usuário pode começar
            // a digitar imediatamente, sem precisar clicar para abrir a busca.
            if (
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              setSearch(e.key);
              setOpen(true);
              return;
            }

            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.nome ?? selectedLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput
            placeholder="Digite para localizar a peça…"
            value={search}
            onValueChange={setSearch}
            autoFocus
            onKeyDown={(e) => {
              if (e.key !== "Tab" || e.shiftKey) return;

              const commandRoot = e.currentTarget.closest('[cmdk-root]');
              const highlightedItem = commandRoot?.querySelector<HTMLElement>(
                '[cmdk-item][aria-selected="true"]',
              );

              if (!highlightedItem) return;

              e.preventDefault();
              highlightedItem.click();
              requestAnimationFrame(focusNextField);
            }}
          />
          <CommandList>
            <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
            <CommandGroup>
              {pecas.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.nome}
                  onSelect={() => {
                    onValueChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {p.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ItemRow({
  it,
  pecas,
  onSave,
  onRemove,
}: {
  it: any;
  pecas: any[];
  onSave: (i: Item) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState<Item>({
    peca_id: it.peca_id,
    quantidade: Number(it.quantidade),
  });
  const dirty = local.peca_id !== it.peca_id || local.quantidade !== Number(it.quantidade);

  // When peça is changed, immediately save
  const handlePecaChange = (v: string) => {
    const newLocal = { ...local, peca_id: v };
    setLocal(newLocal);
    onSave(newLocal);
  };

  return (
    <tr className="border-t">
      <td className="px-2 py-1">
        <SearchablePecaSelect
          value={local.peca_id}
          pecas={pecas}
          onValueChange={handlePecaChange}
          selectedLabel={it.pecas?.nome}
          placeholder="Selecione a peça…"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          className="h-8 text-right font-mono"
          type="number"
          min={1}
          step="1"
          value={local.quantidade}
          onChange={(e) => setLocal({ ...local, quantidade: Number(e.target.value) })}
          onBlur={() => dirty && onSave(local)}
        />
      </td>
      <td className="px-4 py-1 text-right font-mono text-muted-foreground">{brl(it.valor_unit)}</td>
      <td className="px-4 py-1 text-right font-mono">{brl(it.valor_total)}</td>
      <td className="px-4 py-1 text-right font-mono text-muted-foreground">
        {brl(it.custo_total)}
      </td>
      <td className="px-1 py-1 text-right">
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
