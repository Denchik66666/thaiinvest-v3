import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyToken } from "@/lib/auth";

/**
 * Next.js 16+: файл `middleware.ts` переименован в конвенцию **`proxy.ts`** (один из двух нельзя).
 * Здесь защита кабинета: для `/dashboard/*` без валидного JWT в cookie `token` — редирект на `/login`.
 * Проверка через `verifyToken` (`lib/auth.ts`); proxy по умолчанию в **Node.js runtime**.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("token")?.value;
  const decoded = token ? verifyToken(token) : null;

  if (!decoded) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
