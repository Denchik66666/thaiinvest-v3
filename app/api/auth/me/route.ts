import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { isTransientDbError, withDbRetry } from '@/lib/db-retry'

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

    const user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          role: true,
          isSystemOwner: true,
        },
      })
    )

    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isSystemOwner: user.isSystemOwner,
      },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: 'Временная ошибка БД, повторите запрос' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}