import "server-only";
import { db } from "@/lib/db";

/** Quantas notificações não lidas o usuário tem (para o contador do sino no cabeçalho). */
export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Quantos avisos o balão do sino mostra (os mais recentes). */
export const RECENT_LIMIT = 15;

/** Avisos mais recentes do usuário, para o balão do sino. */
export function recentNotifications(userId: string, take = RECENT_LIMIT) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, title: true, body: true, createdAt: true, readAt: true },
  });
}
