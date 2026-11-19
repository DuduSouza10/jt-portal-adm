import "server-only";
import { db } from "@/lib/db";

/** Quantas notificações não lidas o usuário tem (para o contador do sino no cabeçalho). */
export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export const PAGE_SIZE = 50;

export async function listNotifications(userId: string, page: number) {
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.notification.count({ where: { userId } }),
    unreadCount(userId),
  ]);
  return { rows, total, unread };
}
