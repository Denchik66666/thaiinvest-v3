export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/auth'
import { cookies } from 'next/headers'

import { LoginSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const result = LoginSchema.safeParse(json)

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Некорректные данные' }, { status: 400 })
    }

    const username = result.data.username.trim()
    const { password } = result.data

    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    })

    if (!user || user.isArchived) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const ok = bcrypt.compareSync(password, user.password)

    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    })

    const cookieStore = await cookies()
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isSystemOwner: user.isSystemOwner,
      },
    })
  } catch (error) {
    console.error('LOGIN ERROR:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}