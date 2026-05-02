import { newId } from './ids';

export type AkteNote = {
  id: string;
  akte_id: string;
  user_id: string;
  content: string;
  created_at: number;
};

export type AkteNoteWithAuthor = AkteNote & {
  author_email: string;
  author_display_name: string | null;
};

export async function listNotesByAkte(
  db: D1Database,
  akteId: string,
): Promise<AkteNoteWithAuthor[]> {
  const result = await db
    .prepare(
      `SELECT n.id, n.akte_id, n.user_id, n.content, n.created_at,
              u.email AS author_email, u.display_name AS author_display_name
       FROM akte_note n
       LEFT JOIN kanzlei_user u ON n.user_id = u.id
       WHERE n.akte_id = ?1
       ORDER BY n.created_at DESC`,
    )
    .bind(akteId)
    .all<AkteNoteWithAuthor>();
  return result.results ?? [];
}

export async function createNote(
  db: D1Database,
  akteId: string,
  userId: string,
  content: string,
): Promise<AkteNote> {
  const id = newId();
  await db
    .prepare('INSERT INTO akte_note (id, akte_id, user_id, content) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, akteId, userId, content)
    .run();
  const row = await db
    .prepare('SELECT * FROM akte_note WHERE id = ?1')
    .bind(id)
    .first<AkteNote>();
  if (!row) throw new Error('failed to read back created note');
  return row;
}

export async function deleteNote(
  db: D1Database,
  akteId: string,
  noteId: string,
  userId: string,
): Promise<void> {
  // Only the author may delete their note (kept simple — admins can override later if needed).
  await db
    .prepare('DELETE FROM akte_note WHERE id = ?1 AND akte_id = ?2 AND user_id = ?3')
    .bind(noteId, akteId, userId)
    .run();
}
