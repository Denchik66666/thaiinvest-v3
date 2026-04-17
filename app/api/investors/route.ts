import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { CreateInvestorSchema } from '@/lib/schemas'
import { logAction } from '@/lib/audit'
import { countFullWeeksBetween, getNextMonday, getPreviousOrCurrentMonday } from '@/lib/weekly'
import { hashPassword } from '@/lib/auth'
import { getPrivateInvestorCreateContext } from '@/lib/private-investor-create-context'

type InvestorRoutePaymentRow = {
  id: number
  investorId: number
  type: string
  amount: number
  status: string
  comment: string | null
  createdAt: Date
  approvedAt: Date | null
  acceptedAt: Date | null
}
type InvestorRouteRow = {
  id: number
  ownerId: number
  name: string
  handle: string | null
  phone: string | null
  body: number
  rate: number
  accrued: number
  entryDate: Date
  activationDate: Date
  status: string
  isPrivate: boolean
  isSystemOwner: boolean
  createdAt: Date
  updatedAt: Date
  linkedUserId: number | null
  investorUserId: number | null
  owner: { id: number; username: string; role: string }
  investorUser: { id: number; username: string } | null
  payments: InvestorRoutePaymentRow[]
}
type InvestorCreateTxClient = Pick<PrismaClient, 'user' | 'investor'>

/* ================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
================================ */

// ретро‑расчёт процентов
function calculateAccrued(body: number, rate: number, weeks: number): number {
  const weeklyRate = (rate / 100) / 4     // упрощенно: месячная ÷ 4
  return body * weeklyRate * weeks
}

function randomPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return result
}

async function generateUniqueInvestorUsername(baseName: string) {
  const slug = (baseName || 'investor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8) || 'investor'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = `${Math.floor(1000 + Math.random() * 9000)}`
    const username = `inv_${slug}_${suffix}`
    const exists = await prisma.user.findUnique({ where: { username } })
    if (!exists) return username
  }
  return `inv_${Date.now()}`
}

/* ================================
            GET инвесторы
=============================== */

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)
    const network = searchParams.get('network') ?? 'all'

    let whereClause: { isPrivate?: boolean; ownerId?: number; investorUserId?: number } = {}

    // OWNER видит только СВОИХ инвесторов в общей сети
    if (decoded.role === 'OWNER') {
      whereClause = { isPrivate: false, ownerId: decoded.userId }
    }

    // SUPER_ADMIN видит всё, но может переключать фильтр
    if (decoded.role === 'SUPER_ADMIN') {
      if (network === 'common') whereClause = { isPrivate: false }
      else if (network === 'private') whereClause = { isPrivate: true }
    }

    // INVESTOR видит только свой профиль инвестора
    if (decoded.role === 'INVESTOR') {
      whereClause = { investorUserId: decoded.userId }
    }

    const investors = await prisma.investor.findMany({
      where: whereClause,
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
        investorUser: {
          select: {
            id: true,
            username: true,
          },
        },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const typedInvestors = investors as InvestorRouteRow[]
    const result = typedInvestors.map((inv) => {
      const completedPayments = inv.payments.filter((p) => p.status === 'completed')
      const paid = completedPayments.reduce((sum, p) => sum + p.amount, 0)
      const interestPaid = completedPayments
        .filter((p) => p.type === 'interest')
        .reduce((sum, p) => sum + p.amount, 0)
      
      const due = Math.max(inv.accrued - interestPaid, 0)

      const basePayload = {
        id: inv.id,
        ownerId: inv.ownerId,
        name: inv.name,
        handle: inv.handle,
        phone: inv.phone,
        body: inv.body,
        rate: inv.rate,
        accrued: inv.accrued,
        paid,
        due,
        entryDate: inv.entryDate,
        activationDate: inv.activationDate,
        status: inv.status,
        isPrivate: inv.isPrivate,
        isSystemOwner: inv.isSystemOwner,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        owner: inv.owner,
        investorUser: inv.investorUser,
        payments: inv.payments.map((p) => ({
          id: p.id,
          investorId: p.investorId,
          type: p.type,
          amount: p.amount,
          status: p.status,
          comment: p.comment,
          createdAt: p.createdAt,
          approvedAt: p.approvedAt,
          acceptedAt: p.acceptedAt,
        })),
      }

      // linkedUserId is internal and hidden from OWNER responses.
      if (decoded.role === 'OWNER') return basePayload

      return {
        ...basePayload,
        linkedUserId: inv.linkedUserId,
        investorUserId: inv.investorUserId,
      }
    })

    return NextResponse.json({ investors: result })
  } catch (error) {
    console.error('Get investors error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

/* ================================
          POST СОЗДАНИЕ
================================ */

export async function POST(request: NextRequest) {
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
    if (decoded.role === 'INVESTOR') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    // 1. Валидация Zod
    const bodyResult = CreateInvestorSchema.safeParse(await request.json())
    if (!bodyResult.success) {
      return NextResponse.json({ error: bodyResult.error.issues[0]?.message ?? 'Некорректные данные' }, { status: 400 })
    }

    const { 
      name, 
      handle, 
      phone, 
      body: investorBody, 
      rate, 
      entryDate, 
      isPrivate 
    } = bodyResult.data

    const isPrivateNetwork = Boolean(isPrivate)
    const entry = new Date(entryDate)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const activationDate = getNextMonday(entry)
    const status = activationDate <= today ? 'active' : 'awaiting_activation'

    /* ================================
          Проверка лимита Личной Сети + ставка (SUPER_ADMIN)
    ================================= */

    let finalRate = rate

    if (decoded.role === 'SUPER_ADMIN' && isPrivateNetwork) {
      const ctx = await getPrivateInvestorCreateContext(decoded.userId)
      if (!ctx.ok) {
        return NextResponse.json({ error: ctx.message }, { status: 400 })
      }

      const fmt = (n: number) => `${n.toLocaleString('ru-RU')} ฿`
      if (ctx.privateBodiesTotal + investorBody > ctx.commonBody) {
        return NextResponse.json(
          {
            error: `Лимит личной сети: в личной сети уже ${fmt(ctx.privateBodiesTotal)}, тело общей позиции «${ctx.commonInvestorName}» — ${fmt(ctx.commonBody)}. Сейчас можно добавить не больше ${fmt(ctx.remainingForPrivate)} (сумма тел личных позиций не может превышать тело общей).`,
          },
          { status: 400 }
        )
      }

      finalRate = ctx.privateAppliedRatePercent
    }

    /* ================================
           РЕТРО-РАСЧЁТ ПРОЦЕНТОВ
    ================================= */

    let accrued = 0
    if (status === 'active') {
      const currentWeekMonday = getPreviousOrCurrentMonday(today)
      const weeks = countFullWeeksBetween(activationDate, currentWeekMonday)
      if (weeks > 0) {
        accrued = calculateAccrued(investorBody, finalRate, weeks)
      }
    }

    /* ================================
           СОЗДАЁМ ИНВЕСТОРА
    ================================= */

    const generatedUsername = await generateUniqueInvestorUsername(name)
    const generatedPassword = randomPassword(10)

    const investor = await prisma.$transaction(async (tx: InvestorCreateTxClient) => {
      const investorUser = await tx.user.create({
        data: {
          username: generatedUsername,
          password: hashPassword(generatedPassword),
          role: 'INVESTOR',
          isSystemOwner: false,
        },
      })

      return tx.investor.create({
        data: {
          ownerId: decoded.userId,
          investorUserId: investorUser.id,
          name,
          handle: handle ?? null,
          phone: phone ?? null,
          body: investorBody,
          rate: finalRate,
          accrued: accrued,
          entryDate: entry,
          activationDate: activationDate,
          status: status,
          isPrivate: isPrivateNetwork,
        },
      })
    })

    // Логируем действие
    await logAction({
      userId: decoded.userId,
      action: 'CREATE_INVESTOR',
      entityType: 'Investor',
      entityId: investor.id,
      newValue: JSON.stringify(investor)
    })

    return NextResponse.json({
      success: true,
      investor,
      credentials: {
        username: generatedUsername,
        password: generatedPassword,
      },
    })
  } catch (error) {
    console.error('Create investor error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
