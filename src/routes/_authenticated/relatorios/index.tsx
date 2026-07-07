import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { FileText, Printer, Building2, Truck, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios/")({
  head: () => ({ meta: [{ title: "Relatórios — Alyani" }] }),
  component: Page,
});

const items = [
  { to: "/relatorios/hotel", label: "Relatório por Hotel", icon: Building2, desc: "Consumo mensal por peça, receita e vencimentos.", ready: true },
  { to: "/relatorios/prestadora", label: "Relatório por Prestadora", icon: Truck, desc: "Peças processadas, custos e pagamentos.", ready: false },
  { to: "/relatorios/roll", label: "Espelho de Roll", icon: ClipboardList, desc: "Reprodução do Roll para envio ao cliente.", ready: false },
  { to: "/relatorios/faturamento", label: "Faturamento consolidado", icon: FileText, desc: "Totais do período por hotel e por prestadora.", ready: false },
];

function Page() {
  return (
    <>
      <PageHeader title="Relatórios" description="Reproduzem fielmente o layout das planilhas oficiais Alyani." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((it) => (
          <Link key={it.to} to={it.ready ? it.to : "/relatorios"} className={`group rounded-md border bg-card p-4 flex items-start gap-3 transition ${it.ready ? "hover:border-primary" : "opacity-60 cursor-not-allowed"}`}>
            <div className="rounded-md bg-primary/10 text-primary p-2"><it.icon className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">{it.label}</div>
                {!it.ready && <span className="text-[10px] uppercase tracking-wider text-muted-foreground border rounded px-1.5 py-0.5">Fase 2</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
            <Printer className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </Link>
        ))}
      </div>
    </>
  );
}