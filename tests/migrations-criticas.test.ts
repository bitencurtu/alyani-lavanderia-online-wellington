import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase", "migrations");
const sql = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
      .join("\n\n")
  : "";

function requireSql(pattern: RegExp, message: string) {
  assert.match(sql, pattern, message);
}

test("criação transacional de Roll Alyani existe", () => {
  requireSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_roll_alyani_transaction/i,
    "A RPC transacional de Roll Alyani precisa existir nas migrations.",
  );
  requireSql(
    /INSERT\s+INTO\s+public\.rolls_alyani_itens/i,
    "A criação transacional precisa inserir os itens do Roll Alyani.",
  );
});

test("criação transacional de Roll Prestadora existe", () => {
  requireSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_roll_prestadora_transaction/i,
    "A RPC transacional de Roll Prestadora precisa existir nas migrations.",
  );
});

test("alteração em lote de pagamentos é atômica", () => {
  requireSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.set_pagamentos_status_transaction/i,
    "A RPC de status em lote de pagamentos precisa existir.",
  );
  requireSql(
    /WHEN\s+p_status\s*=\s*'pago'\s+THEN\s+COALESCE\(data_pagamento,\s*CURRENT_DATE\)/i,
    "Ao marcar como pago, a data de pagamento deve ser preenchida na mesma operação.",
  );
});

test("preço zero é bloqueado nos itens de Roll Alyani", () => {
  requireSql(
    /COALESCE\(NEW\.valor_unit,\s*0\)\s*<=\s*0/i,
    "Preço de venda zero ou negativo deve ser bloqueado pelo banco.",
  );
});

test("vencimento do Roll tem limite de ano", () => {
  requireSql(
    /data_vencimento\s+BETWEEN\s+DATE\s+'2000-01-01'\s+AND\s+DATE\s+'2100-12-31'/i,
    "A data de vencimento precisa ficar entre 2000 e 2100.",
  );
});

test("RPC protegida não expõe recálculo interno diretamente", () => {
  requireSql(
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.tg_roll_recalc\(uuid\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    "tg_roll_recalc deve continuar protegida de chamadas diretas do frontend.",
  );
});
