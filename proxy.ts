import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'

const PROTECTED_PREFIXES = ['/dashboard', '/api/investors', '/api/payments', '/api/dashboard', '/api/system']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const token = request.cookies.get('token')?.value
  const decoded = token ? verifyToken(token) : null

  if (isProtected && !decoded) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/investors/:path*', '/api/payments/:path*', '/api/dashboard/:path*', '/api/system/:path*', '/login', '/api/auth/login'],
}
