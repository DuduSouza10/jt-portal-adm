"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function markAllReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

/** Abre a notificação: marca como lida e vai para o link (só caminhos internos). */
export async function openNotificationAction(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  if (n.link?.startsWith("/") && !n.link.startsWith("//")) redirect(n.link);
}
