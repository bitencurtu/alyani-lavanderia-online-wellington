import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { brl, firstOfMonth, lastOfMonth } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios/financeiro")({
  head: () => ({ meta: [{ title: "Relatório Financeiro — Alyani" }] }),
  component: Page,
});

function Page() {
  const [dataInicio, setDataInicio] = useState(firstOfMonth());
  const [dataFim, setDataFim] = useState(lastOfMonth());

  const { data: rolls = [] } = useQuery({
    queryKey: ["rel-financeiro", dataInicio, dataFim],
    queryFn: async () => (
      await supabase.from("rolls_alyani").select(
        "*,hoteis(*),prestadoras(*),rolls_alyani_itens(*)"
      ).gte("data_roll", dataInicio).lte("data_roll", dataFim).order("data_roll")
    ).data ?? [],
  });

  const data = useMemo(() => {
    let receitaTotal = 0;
    let custoTotal = 0;
    let qtdPecas = 0;
    const porHotel = new Map<string, any>();
    const porPrestadora = new Map<string, any>();

    for (const roll of rolls as any[]) {
      const receita = Number(roll.total_receita ?? 0);
      const custo = Number(roll.total_custo ?? 0);

      receitaTotal += receita;
      custoTotal += custo;

      for (const item of roll.rolls_alyani_itens ?? []) {
        qtdPecas += Number(item.quantidade ?? 0);
      }

      const hotelId = roll.hotel_id;
      if (!porHotel.has(hotelId)) {
        porHotel.set(hotelId, {
          nome: roll.hoteis?.nome ?? "—",
          receita: 0,
          custo: 0,
          qtdRolls: 0,
        });
      }
      const hTotal = porHotel.get(hotelId)!;
      hTotal.receita += receita;
      hTotal.custo += custo;
      hTotal.qtdRolls += 1;

      const prestId = roll.prestadora_id;
      if (!porPrestadora.has(prestId)) {
        porPrestadora.set(prestId, {
          nome: roll.prestadoras?.nome ?? "—",
          receita: 0,
          custo: 0,
          qtdRolls: 0,
        });
      }
      const pTotal = porPrestadora.get(prestId)!;
      pTotal.receita += receita;
      pTotal.custo += custo;
      pTotal.qtdRolls += 1;
    }

    const lucroTotal = receitaTotal - custoTotal;
    const qtdRolls = rolls.length;

    return {
      receitaTotal,
      custoTotal,
      lucroTotal,
      qtdPecas,
      qtdRolls,
      porHotel: Array.from(porHotel.values()),
      porPrestadora: Array.from(porPrestadora.values()),
    };
  }, [rolls]);

  return (
    <>
      <PageHeader
        title="Relatório Financeiro"
        description="Resumo de receita, custos, lucro e totais por hotel e prestadora."
      />
      <div className="rounded-md border bg-card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data inicial
          </Label>
          <Input type="date" className="h-9 w-[150px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Data final
          </Label>
          <Input type="date" className="h-9 w-[150px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Receita Total</div>
          <div className="text-2xl font-bold text-green-700">{brl(data.receitaTotal)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Custos Totais</div>
          <div className="text-2xl font-bold text-red-700">{brl(data.custoTotal)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Lucro Total</div>
          <div className="text-2xl font-bold text-emerald-700">{brl(data.lucroTotal)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Qtd. Peças / Rolls
          </div>
          <div className="text-2xl font-bold">
            {data.qtdPecas} / {data.qtdRolls}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-semibold">Total por Hotel</div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-1.5 font-medium">Hotel</th>
                <th className="text-right px-4 py-1.5 font-medium">Receita</th>
                <th className="text-right px-4 py-1.5 font-medium">Custo</th>
                <th className="text-right px-4 py-1.5 font-medium">Lucro</th>
                <th className="text-right px-4 py-1.5 font-medium">Qtd Rolls</th>
              </tr>
            </thead>
            <tbody>
              {data.porHotel.map((hotel) => (
                <tr key={hotel.nome} className="border-t">
                  <td className="px-4 py-1.5">{hotel.nome}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(hotel.receita)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(hotel.custo)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(hotel.receita - hotel.custo)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{hotel.qtdRolls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-semibold">Total por Prestadora</div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-1.5 font-medium">Prestadora</th>
                <th className="text-right px-4 py-1.5 font-medium">Receita</th>
                <th className="text-right px-4 py-1.5 font-medium">Custo</th>
                <th className="text-right px-4 py-1.5 font-medium">Lucro</th>
                <th className="text-right px-4 py-1.5 font-medium">Qtd Rolls</th>
              </tr>
            </thead>
            <tbody>
              {data.porPrestadora.map((prestadora) => (
                <tr key={prestadora.nome} className="border-t">
                  <td className="px-4 py-1.5">{prestadora.nome}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(prestadora.receita)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(prestadora.custo)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{brl(prestadora.receita - prestadora.custo)}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{prestadora.qtdRolls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
