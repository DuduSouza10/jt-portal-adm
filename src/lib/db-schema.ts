/**
 * Schema do Postgres onde ficam as tabelas do sistema (padrão "public").
 * Em produção usamos "insumos", dentro do mesmo banco do sistema de chamados.
 */
export function dbSchema() {
  const s = process.env.DATABASE_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error(`DATABASE_SCHEMA inválido: ${s}`);
  return s;
}
