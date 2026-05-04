// Direktnachrichten zwischen Mandant und Kanzlei pro Akte.

import { newId } from './ids';

export type MessageSender = 'mandant' | 'lawyer';

export type Message = {
  id: string;
  akte_id: string;
  kanzlei_id: string;
  sender: MessageSender;
  sender_user_id: string | null;
  body: string;
  read_at: number | null;
  created_at: number;
};

export type MessageWithAuthor = Message & {
  author_email: string | null;
  author_display_name: string | null;
};

export async function listMessages(
  db: D1Database,
  akteId: string,
): Promise<MessageWithAuthor[]> {
  const result = await db
    .prepare(
      `SELECT m.*,
              u.email AS author_email, u.display_name AS author_display_name
       FROM message m
       LEFT JOIN kanzlei_user u ON m.sender_user_id = u.id
       WHERE m.akte_id = ?1
       ORDER BY m.created_at ASC`,
    )
    .bind(akteId)
    .all<MessageWithAuthor>();
  return result.results ?? [];
}

export async function createMessage(
  db: D1Database,
  args: {
    akteId: string;
    kanzleiId: string;
    sender: MessageSender;
    senderUserId: string | null;
    body: string;
  },
): Promise<Message> {
  const id = newId();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO message (id, akte_id, kanzlei_id, sender, sender_user_id, body, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(id, args.akteId, args.kanzleiId, args.sender, args.senderUserId, args.body, now)
    .run();
  return {
    id,
    akte_id: args.akteId,
    kanzlei_id: args.kanzleiId,
    sender: args.sender,
    sender_user_id: args.senderUserId,
    body: args.body,
    read_at: null,
    created_at: now,
  };
}

/** Markiert alle Nachrichten der "Gegenseite" als gelesen (Lesebestätigung). */
export async function markRead(
  db: D1Database,
  akteId: string,
  reader: MessageSender,
): Promise<void> {
  const otherSide: MessageSender = reader === 'lawyer' ? 'mandant' : 'lawyer';
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE message SET read_at = ?1
       WHERE akte_id = ?2 AND sender = ?3 AND read_at IS NULL`,
    )
    .bind(now, akteId, otherSide)
    .run();
}

export async function unreadFromMandantCount(
  db: D1Database,
  kanzleiId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM message
       WHERE kanzlei_id = ?1 AND sender = 'mandant' AND read_at IS NULL`,
    )
    .bind(kanzleiId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
