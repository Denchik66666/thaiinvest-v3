import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET is required')
  }

  return secret
}

export interface AuthTokenPayload {
  userId: number
  username: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'INVESTOR'
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password: string, hashedPassword: string) {
  return bcrypt.compareSync(password, hashedPassword)
}

export function generateToken(payload: object) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, getJwtSecret())

    if (typeof decoded === 'string') {
      return null
    }

    if (
      typeof decoded.userId !== 'number' ||
      typeof decoded.username !== 'string' ||
      (decoded.role !== 'SUPER_ADMIN' && decoded.role !== 'OWNER' && decoded.role !== 'INVESTOR')
    ) {
      return null
    }

    return decoded as AuthTokenPayload
  } catch {
    return null
  }
}