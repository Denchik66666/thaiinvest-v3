/**
 * In-memory кеш ответа `GET /api/auth/me` (короткий TTL).
 * При смене username / avatar в БД обязательно вызывать `invalidateAuthMeServerCache`,
 * иначе до истечения TTL клиент получит устаревший `user.username` / `avatarUrl`.
 */

export type AuthMeCachedPayload = {
  user: {
    id: number;
    username: string;
    avatarUrl: string | null;
    role: string;
    isSystemOwner: boolean;
    createdAt: string;
  };
};

type Entry = { expiresAt: number; payload: AuthMeCachedPayload };

const cache = new Map<number, Entry>();

export const AUTH_ME_SERVER_CACHE_TTL_MS = 15_000;

export function readAuthMeServerCache(userId: number): AuthMeCachedPayload | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return hit.payload;
}

export function writeAuthMeServerCache(userId: number, payload: AuthMeCachedPayload): void {
  cache.set(userId, { expiresAt: Date.now() + AUTH_ME_SERVER_CACHE_TTL_MS, payload });
}

export function invalidateAuthMeServerCache(userId: number): void {
  cache.delete(userId);
}
