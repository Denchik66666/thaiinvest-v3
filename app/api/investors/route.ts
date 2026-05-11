import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { CreateInvestorSchema } from '@/lib/schemas'
import { logAction } from '@/lib/audit'
import { getNextMonday, getPreviousOrCurrentMonday, startOfDay } from '@/lib/weekly'
import {
  getCurrentBusinessRate,
  getCurrentBusinessRateForCalendarYmd,
  dateToUtcCalendarYmd,
} from '@/lib/business-rate'
import { hashPassword } from '@/lib/auth'
import { getPrivateInvestorCreateContext } from '@/lib/private-investor-create-context'
import { isTransientDbError, withDbRetry } from '@/lib/db-retry'
import { moneyRound2 } from '@/lib/money-round'

type CacheEntry = { expiresAt: number; payload: unknown }
const CACHE_TTL_MS = 20_000
/** Lean-списки для дашборда — реже бьём БД при параллельных вкладках. */
const LEAN_CACHE_TTL_MS = 45_000
const memoryCache = new Map<string, CacheEntry>()

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
  investorUser: { id: number; username: string; avatarUrl: string | null } | null
  linkedUser: { id: number; username: string; avatarUrl: string | null } | null
  payments: InvestorRoutePaymentRow[]
}
type InvestorCreateTxClient = Pick<PrismaClient, 'user' | 'investor'>

/* ================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
================================ */

function randomPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return result
}

/** Активные OWNER — для SUPER_ADMIN при `network=common` (карточка «Сеть платформы» на Manage). */
async function fetchCommonNetworkOwnersSummary() {
  return withDbRetry(() =>
    prisma.user.findMany({
      where: { role: 'OWNER', isArchived: false },
      select: { id: true, username: true },
      orderBy: { id: 'asc' },
    })
  )
}

/**
 * Внешняя общая сеть в продукте закреплена за OWNER (операционный владелец, напр. Сэм).
 * Карточки общей сети, созданные SUPER_ADMIN, должны числиться на него — иначе OWNER не видит их на главной и в реестре.
 */
async function resolveOwnerIdForNewInvestor(
  role: string,
  creatorUserId: number,
  isPrivateNetwork: boolean
): Promise<number> {
  if (role !== 'SUPER_ADMIN' || isPrivateNetwork) return creatorUserId
  const owner = await withDbRetry(() =>
    prisma.user.findFirst({
      where: { role: 'OWNER', isArchived: false },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  )
  return owner?.id ?? creatorUserId
}

async function generateUniqueInvestorUsername(baseName: string) {
  const slug = (baseName || 'investor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8) || 'investor'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = `${Math.floor(1000 + Math.random() * 9000)}`
    const username = `inv_${slug}_${suffix}`
    const exists = await withDbRetry(() => prisma.user.findUnique({ where: { username } }))
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
    /** Без полной истории платежей: агрегаты + только незавершённые (быстрее для дашборда и списков). */
    const lean =
      searchParams.get('lean') === '1' &&
      decoded.role !== 'INVESTOR'

    const leanCacheKey = lean
      ? `${decoded.userId}:${decoded.role}:${decoded.role === 'OWNER' ? 'owner-all' : network}:lean`
      : null

    if (leanCacheKey) {
      const cached = memoryCache.get(leanCacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
          headers: { 'Cache-Control': 'private, max-age=45, stale-while-revalidate=90' },
        })
      }
    }

    let whereClause: { isPrivate?: boolean; ownerId?: number; investorUserId?: number } = {}

    // OWNER видит все свои позиции (общая и личная); фильтр по сети — на клиенте для SUPER_ADMIN.
    if (decoded.role === 'OWNER') {
      whereClause = { ownerId: decoded.userId }
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

    function mapPaymentsToPayload(
      payments: Array<{
        id: number
        investorId: number
        type: string
        amount: number
        status: string
        comment: string | null
        createdAt: Date
        approvedAt: Date | null
        acceptedAt: Date | null
      }>
    ) {
      return payments.map((p) => ({
        id: p.id,
        investorId: p.investorId,
        type: p.type,
        amount: p.amount,
        status: p.status,
        comment: p.comment,
        createdAt: p.createdAt,
        approvedAt: p.approvedAt,
        acceptedAt: p.acceptedAt,
      }))
    }

    if (lean) {
      const openStatuses = ['requested', 'approved_waiting_accept', 'expired', 'disputed', 'pending']

      const leanPayload = await withDbRetry(async () => {
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
                avatarUrl: true,
              },
            },
            linkedUser: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        const ids = investors.map((i) => i.id)
        if (ids.length === 0) {
          return {
            investors: [] as typeof investors,
            completedAll: [] as Awaited<ReturnType<typeof prisma.payment.groupBy>>,
            completedInterest: [] as Awaited<ReturnType<typeof prisma.payment.groupBy>>,
            openPayments: [] as Awaited<ReturnType<typeof prisma.payment.findMany>>,
          }
        }

        const [completedAll, completedInterest, openPayments] = await Promise.all([
          prisma.payment.groupBy({
            by: ['investorId'],
            where: { investorId: { in: ids }, status: 'completed' },
            _sum: { amount: true },
          }),
          prisma.payment.groupBy({
            by: ['investorId'],
            where: { investorId: { in: ids }, status: 'completed', type: 'interest' },
            _sum: { amount: true },
          }),
          prisma.payment.findMany({
            where: {
              investorId: { in: ids },
              status: { in: openStatuses },
            },
            orderBy: { createdAt: 'desc' },
          }),
        ])

        return {
          investors,
          completedAll,
          completedInterest,
          openPayments,
        }
      })

      const { investors, completedAll, completedInterest, openPayments } = leanPayload
      if (!investors.length) {
        if (decoded.role === 'SUPER_ADMIN' && network === 'common') {
          const commonNetworkOwners = await fetchCommonNetworkOwnersSummary()
          const emptyPayload = { investors: [], commonNetworkOwners }
          if (leanCacheKey) {
            memoryCache.set(leanCacheKey, { expiresAt: Date.now() + LEAN_CACHE_TTL_MS, payload: emptyPayload })
          }
          return NextResponse.json(emptyPayload, {
            headers: { 'Cache-Control': 'private, max-age=45, stale-while-revalidate=90' },
          })
        }
        return NextResponse.json({ investors: [] })
      }

      const paidByInv = new Map<number, number>()
      for (const row of completedAll) {
        paidByInv.set(row.investorId, row._sum?.amount ?? 0)
      }
      const lifetimeInterestPaidByInv = new Map<number, number>()
      for (const row of completedInterest) {
        lifetimeInterestPaidByInv.set(row.investorId, row._sum?.amount ?? 0)
      }
      const paymentsByInv = new Map<number, typeof openPayments>()
      for (const p of openPayments) {
        const list = paymentsByInv.get(p.investorId) ?? []
        list.push(p)
        paymentsByInv.set(p.investorId, list)
      }

      const result = investors.map((inv) => {
        const paid = paidByInv.get(inv.id) ?? 0
        const lifetimeInterestPaid = lifetimeInterestPaidByInv.get(inv.id) ?? 0
        const invPayments = paymentsByInv.get(inv.id) ?? []
        const accruedRounded = moneyRound2(Math.max(inv.accrued, 0))
        const due = accruedRounded

        const basePayload = {
          id: inv.id,
          ownerId: inv.ownerId,
          name: inv.name,
          handle: inv.handle,
          phone: inv.phone,
          body: inv.body,
          rate: inv.rate,
          accrued: accruedRounded,
          lifetimeInterestPaid,
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
          linkedUser: inv.linkedUser
            ? { id: inv.linkedUser.id, username: inv.linkedUser.username, avatarUrl: inv.linkedUser.avatarUrl ?? null }
            : null,
          payments: mapPaymentsToPayload(invPayments),
        }

        if (decoded.role === 'OWNER') return basePayload

        return {
          ...basePayload,
          linkedUserId: inv.linkedUserId,
          investorUserId: inv.investorUserId,
        }
      })

      const payload =
        decoded.role === 'SUPER_ADMIN' && network === 'common'
          ? { investors: result, commonNetworkOwners: await fetchCommonNetworkOwnersSummary() }
          : { investors: result }
      if (leanCacheKey) {
        memoryCache.set(leanCacheKey, { expiresAt: Date.now() + LEAN_CACHE_TTL_MS, payload })
      }
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'private, max-age=45, stale-while-revalidate=90' },
      })
    }

    const investors = await withDbRetry(() => prisma.investor.findMany({
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
            avatarUrl: true,
          },
        },
        linkedUser: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    }))

    const typedInvestors = investors as InvestorRouteRow[]
    const result = typedInvestors.map((inv) => {
      const completedPayments = inv.payments.filter((p) => p.status === 'completed')
      const paid = completedPayments.reduce((sum, p) => sum + p.amount, 0)
      const lifetimeInterestPaid = completedPayments
        .filter((p) => p.type === 'interest')
        .reduce((sum, p) => sum + p.amount, 0)

      const accruedRounded = moneyRound2(Math.max(inv.accrued, 0))
      const due = accruedRounded

      const basePayload = {
        id: inv.id,
        ownerId: inv.ownerId,
        name: inv.name,
        handle: inv.handle,
        phone: inv.phone,
        body: inv.body,
        rate: inv.rate,
        accrued: accruedRounded,
        lifetimeInterestPaid,
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
        linkedUser: inv.linkedUser
          ? { id: inv.linkedUser.id, username: inv.linkedUser.username, avatarUrl: inv.linkedUser.avatarUrl ?? null }
          : null,
        payments: mapPaymentsToPayload(inv.payments),
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
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: 'Временная ошибка БД, повторите запрос' }, { status: 503 })
    }
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

    const { name, handle, phone, body: investorBody, entryDate, isPrivate } = bodyResult.data

    const isPrivateNetwork = Boolean(isPrivate)
    const entry = new Date(entryDate)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const activationDate = getNextMonday(entry)
    const status = activationDate <= today ? 'active' : 'awaiting_activation'

    /* ================================
          Проверка лимита Личной Сети + ставка (SUPER_ADMIN)
    ================================= */

    let finalRate: number

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
    } else if (!isPrivateNetwork) {
      /**
       * Общая сеть: ставка карточки всегда = бизнес-ставка на дату входа (какая ставка сети на тот день — такой и процент у позиции).
       * OWNER и SUPER_ADMIN: поле rate из запроса не используется.
       */
      const entryYmd =
        typeof entryDate === 'string'
          ? (entryDate.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null)
          : dateToUtcCalendarYmd(entry)
      const snap = entryYmd
        ? await getCurrentBusinessRateForCalendarYmd(entryYmd)
        : await getCurrentBusinessRate(startOfDay(entry))
      if (!snap) {
        const d = entry.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return NextResponse.json(
          {
            error: `На дату входа ${d} ещё не было действующей бизнес-ставки. Владелец задаёт ставку в «Управлении» с датой начала не позже входа; либо смените дату входа инвестора.`,
          },
          { status: 400 }
        )
      }
      finalRate = snap.rate
    } else {
      return NextResponse.json(
        { error: 'Некорректное сочетание роли и типа сети (личная сеть — только для SUPER_ADMIN).' },
        { status: 400 }
      )
    }

    /* ================================
           РЕТРО-РАСЧЁТ ПРОЦЕНТОВ (по неделям и RateHistory)
    ================================= */

    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    let accrued = 0
    if (status === 'active') {
      const currentWeekMonday = getPreviousOrCurrentMonday(today)
      let cursor = new Date(activationDate)
      cursor.setHours(0, 0, 0, 0)
      while (cursor.getTime() < currentWeekMonday.getTime()) {
        const weekStart = new Date(cursor)
        const snap = await getCurrentBusinessRate(weekStart)
        if (!snap) {
          const d = weekStart.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
          return NextResponse.json(
            {
              error: `Ставка сети не задана на ${d}. Сначала задайте ставку в Управлении.`,
            },
            { status: 400 }
          )
        }
        const businessRate = snap.rate
        const appliedRate = isPrivateNetwork ? businessRate / 2 : businessRate
        const weeklyRatePercent = appliedRate / 4
        accrued += investorBody * (weeklyRatePercent / 100)
        cursor = new Date(cursor.getTime() + oneWeekMs)
      }
    }

    /* ================================
           СОЗДАЁМ ИНВЕСТОРА
    ================================= */

    const generatedUsername = await generateUniqueInvestorUsername(name)
    const generatedPassword = randomPassword(10)
    const investorOwnerId = await resolveOwnerIdForNewInvestor(decoded.role, decoded.userId, isPrivateNetwork)

    const investor = await withDbRetry(() => prisma.$transaction(async (tx: InvestorCreateTxClient) => {
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
          ownerId: investorOwnerId,
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
    }))

    // Логируем действие
    try {
      await withDbRetry(() =>
        logAction({
          userId: decoded.userId,
          action: 'CREATE_INVESTOR',
          entityType: 'Investor',
          entityId: investor.id,
          newValue: JSON.stringify(investor)
        })
      )
    } catch (auditError) {
      console.error('Create investor audit error:', auditError)
    }

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
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: 'Временная ошибка БД, повторите операцию' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
