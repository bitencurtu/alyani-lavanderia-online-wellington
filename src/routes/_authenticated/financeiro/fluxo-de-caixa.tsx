import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, firstOfMonth, lastOfMonth } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro/fluxo-de-caixa")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa - Alyani" }] }),
  component: Page,
});

function Page() {
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());
  const [hotelId, setHotelId] = useState("");
  const [prestadoraId, setPrestadoraId] = useState("");

  const { data: hoteis = [] } = useQuery({
    queryKey: ["hoteis-lite"],
    queryFn: async () =>
      (await supabase.from("hoteis").select("*").eq("status", "ativo").order("nome")).data ?? [],
  });

  const { data: prestadoras = [] } = useQuery({
    queryKey: ["prestadoras-lite"],
    queryFn: async () =>
      (
        await supabase
          .from("prestadoras")
          .select("*")
          .eq("status", "ativo")
          .order("nome")
      ).data ?? [],
  });

  const { data: rolls = [] } = useQuery({
    queryKey: ["rolls-fluxo", hotelId, prestadoraId, dataInicio, dataFim],
    queryFn: async () => {
      let q = supabase
        .from("rolls_alyani")
        .select("*,hoteis(*),prestadoras(*),cobrancas(*),pagamentos(*)")
        .gte("data_roll", dataInicio)
        .lte("data_roll", dataFim)
        .order("data_roll");
      if (hotelId) q = q.eq("hotel_id", hotelId);
      if (prestadoraId) q = q.eq("prestadora_id", prestadoraId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    let recebido = 0;
    let aReceber = 0;
    let pago = 0;
    let aPagar = 0;

    for (const roll of rolls as any[]) {
      const receita = Number(roll.total_receita ?? 0);
      const custo = Number(roll.total_custo ?? 0);
      const cob = roll.cobrancas;
      const pag = roll.pagamentos;

      if (cob?.status === "pago") {
        recebido += receita;
      } else {
        aReceber += receita;
      }

      if (pag?.status === "pago") {
        pago += custo;
      } else {
        aPagar += custo;
      }
    }

    const lucroRealizado = recebido - pago;
    const lucroPrevisto = recebido + aReceber - pago - aPagar;

    return { recebido, aReceber, pago, aPagar, lucroRealizado, lucroPrevisto };
  }, [rolls]);

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa"
        description="Visão consolidada de receitas, custos e lucro realizado e previsto."
      />

      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data inicial
          </Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data final
          </Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
        <div className="min-w-[220px]">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Hotel (opcional)
          </Label>
          <Select value={hotelId} onValueChange={setHotelId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              {(hoteis as any[]).map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Prestadora (opcional)
          </Label>
          <Select value={prestadoraId} onValueChange={setPrestadoraId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              {(prestadoras as any[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Recebido
          </div>
          <div className="text-2xl font-bold text-green-600">{brl(totals.recebido)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Contas a Receber
          </div>
          <div className="text-2xl font-bold text-yellow-600">{brl(totals.aReceber)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Pago
          </div>
          <div className="text-2xl font-bold text-red-600">{brl(totals.pago)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Contas a Pagar
          </div>
          <div className="text-2xl font-bold text-orange-600">{brl(totals.aPagar)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Lucro Realizado
          </div>
          <div className="text-2xl font-bold text-emerald-700">{brl(totals.lucroRealizado)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Lucro Previsto
          </div>
          <div className="text-2xl font-bold text-blue-700">{brl(totals.lucroPrevisto)}</div>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Data</th>
              <th className="text-left px-4 py-2 font-medium">ROL</th>
              <th className="text-left px-4 py-2 font-medium">Hotel</th>
              <th className="text-left px-4 py-2 font-medium">Prestadora</th>
              <th className="text-right px-4 py-2 font-medium">Receita</th>
              <th className="text-right px-4 py-2 font-medium">Custo</th>
              <th className="text-right px-4 py-2 font-medium">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center px-4 py-10 text-muted-foreground"
                >
                  Nenhum roll no periodo.
                </td>
              </tr>
            ) : (
              (rolls as any[]).map((roll) => (
                <tr key={roll.id} className="border-t">
                  <td className="px-4 py-2">
                    {new Date(roll.data_roll).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 font-mono">{roll.numero}</td>
                  <td className="px-4 py-2">{roll.hoteis?.nome ?? "-"}</td>
                  <td className="px-4 py-2">{roll.prestadoras?.nome ?? "-"}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {brl(roll.total_receita)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {brl(roll.total_custo)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {brl(roll.total_lucro)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
