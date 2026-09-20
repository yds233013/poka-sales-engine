import { PrismaClient } from "@/generated/prisma";

/**
 * A client bound to whatever DATABASE_URL the integration global-setup put in
 * the environment, rather than the app's module-level singleton (which may
 * have been constructed before the setup ran).
 */
export const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ["error"],
});

export async function requestByRef(reference: string) {
  return db.salesRequest.findFirstOrThrow({ where: { reference } });
}
