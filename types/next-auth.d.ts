import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken: string | undefined
    refreshToken: string | undefined
    expiresAt: number | undefined
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
} 