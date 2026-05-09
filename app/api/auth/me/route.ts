import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { isTransientDbError, withDbRetry } from '@/lib/db-retry'
import {
  readAuthMeServerCache,
  writeAuthMeServerCache,
  type AuthMeCachedPayload,
} from '@/lib/auth-me-server-cache'

type MePayload = AuthMeCachedPayload

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Неверный токен' }, { status: 401 })
    }

    const cached = readAuthMeServerCache(decoded.userId)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' },
      })
    }

    const user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
          isSystemOwner: true,
          createdAt: true,
        },
      })
    )

    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }
    const payload: MePayload = {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isSystemOwner: user.isSystemOwner,
        createdAt: user.createdAt.toISOString(),
      },
    }
    writeAuthMeServerCache(decoded.userId, payload)
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: 'Временная ошибка БД, повторите запрос' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}