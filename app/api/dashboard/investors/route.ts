import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { isTransientDbError, withDbRetry } from '@/lib/db-retry'
import { moneyRound2 } from '@/lib/money-round'

type DashboardPaymentRow = {
  amount: number
  type: string
  status: string
  createdAt: Date
}
type DashboardInvestorRow = {
  id: number
  name: string
  body: number
  rate: number
  accrued: number
  activationDate: Date
  status: string
  isPrivate: boolean
  payments: DashboardPaymentRow[]
}

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

    // Те же границы списка, что и GET /api/investors (без утечки «чужих» инвесторов).
    let whereClause: { isPrivate?: boolean; ownerId?: number; investorUserId?: number } = {}
    if (decoded.role === 'OWNER') {
      whereClause = { ownerId: decoded.userId }
    } else if (decoded.role === 'INVESTOR') {
      whereClause = { investorUserId: decoded.userId }
    }
    // SUPER_ADMIN: без фильтра — полный доступ (как network=all в /api/investors).

    const investors = await withDbRetry(() =>
      prisma.investor.findMany({
        where: whereClause,
        include: {
          payments: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    )

    const typedInvestors = investors as DashboardInvestorRow[]
    const result = typedInvestors.map((investor) => {
      const completed = investor.payments.filter((p) => p.status === 'completed')
      const paid = completed.reduce((sum, payment) => sum + payment.amount, 0)
      const lifetimeInterestPaid = completed
        .filter((payment) => payment.type === 'interest')
        .reduce((sum, payment) => sum + payment.amount, 0)

      const accruedRounded = moneyRound2(Math.max(investor.accrued, 0))

      return {
        id: investor.id,
        name: investor.name,
        body: investor.body,
        rate: investor.rate,
        accrued: accruedRounded,
        lifetimeInterestPaid: moneyRound2(lifetimeInterestPaid),
        paid,
        due: accruedRounded,
        status: investor.status,
        isPrivate: investor.isPrivate,
      }
    })

    return NextResponse.json({ investors: result })
  } catch (error) {
    console.error('Dashboard investors error:', error)
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: 'Временная ошибка БД, повторите запрос' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}