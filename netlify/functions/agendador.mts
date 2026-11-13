// Netlify Scheduled Function: dispara lembretes, resumo diário, reenvio de avisos do Feishu e limpezas.
// Roda a cada 15 min, de segunda a sexta, das 07:00 às 19:45 em São Paulo (10–22 h UTC),
// para economizar os créditos do plano gratuito. O horário comercial "de verdade" é
// conferido no próprio sistema (DEFAULT_BUSINESS_HOURS em src/lib/sla.ts).
export default async function agendador() {
  const url = process.env.URL; // definido pelo Netlify (URL principal do site)
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) {
    console.error("agendador: faltam URL ou CRON_SECRET");
    return;
  }
  const res = await fetch(`${url}/api/cron/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(`agendador: HTTP ${res.status} ${await res.text()}`);
}

export const config = { schedule: "*/15 10-22 * * 1-5" };
