import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'

type DashboardPaymentRow = {
  amount: number
  type: string
}
type DashboardInvestorRow = {
  id: number
  name: string
  body: number
  rate: number
  accrued: number
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

    const whereClause: { isPrivate?: boolean } = {}
    if (decoded.role === 'OWNER') {
      whereClause.isPrivate = false
    }

    const investors = await prisma.investor.findMany({
      where: whereClause,
      include: {
        payments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const typedInvestors = investors as DashboardInvestorRow[]
    const result = typedInvestors.map((investor) => {
      const paid = investor.payments.reduce((sum, payment) => sum + payment.amount, 0)
      const interestPaid = investor.payments
        .filter((payment) => payment.type === 'interest')
        .reduce((sum, payment) => sum + payment.amount, 0)

      return {
        id: investor.id,
        name: investor.name,
        body: investor.body,
        rate: investor.rate,
        accrued: investor.accrued,
        paid,
        due: Math.max(investor.accrued - interestPaid, 0),
        status: investor.status,
        isPrivate: investor.isPrivate,
      }
    })

    return NextResponse.json({ investors: result })
  } catch (error) {
    console.error('Dashboard investors error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}