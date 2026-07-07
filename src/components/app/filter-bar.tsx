import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

export type FilterState = {
  dataInicio?: string;
  dataFim?: string;
  hotelId?: string;
  prestadoraId?: string;
  numero?: string;
  status?: string;
  pecaId?: string;
  q?: string;
};

export function FilterBar({
  value,
  onChange,
  onClear,
  children,
  showPeriodo = true,
  showBusca = true,
  showNumero = false,
}: {
  value: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onClear?: () => void;
  children?: ReactNode;
  showPeriodo?: boolean;
  showBusca?: boolean;
  showNumero?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        {showBusca && (
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Buscar
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Digite para pesquisar…"
                value={value.q ?? ""}
                onChange={(e) => onChange({ q: e.target.value })}
              />
            </div>
          </div>
        )}
        {showPeriodo && (
          <>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Período inicial
              </Label>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={value.dataInicio ?? ""}
                onChange={(e) => onChange({ dataInicio: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Período final
              </Label>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={value.dataFim ?? ""}
                onChange={(e) => onChange({ dataFim: e.target.value })}
              />
            </div>
          </>
        )}
        {showNumero && (
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Nº Roll
            </Label>
            <Input
              className="h-9 w-[130px]"
              value={value.numero ?? ""}
              onChange={(e) => onChange({ numero: e.target.value })}
            />
          </div>
        )}
        {children}
        {onClear && (
          <Button variant="outline" size="sm" className="h-9" onClick={onClear}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        )}
      </div>
    </div>
  );
}