import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { dbSchema } from "@/lib/db-schema";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg(
    {
      connectionString: process.env.DATABASE_URL,
      // Em serverless cada instância deve abrir poucas conexões; o pooler do Supabase faz o resto.
      max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    },
    // As tabelas podem ficar num schema próprio (ex.: "insumos") dentro de um banco compartilhado.
    { schema: dbSchema() },
  );
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
