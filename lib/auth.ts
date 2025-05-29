import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/drive.readonly"
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      // Check if the user's email ends with @developiq.ai
      if (user.email && user.email.endsWith('@developiq.ai')) {
        return true
      }
      
      // Reject sign-in for users not from developiq.ai
      return false
    },
    async jwt({ token, account }) {
      console.log("JWT callback - account:", !!account, "token keys:", Object.keys(token))
      if (account) {
        token.accessToken = account.access_token || ""
        token.refreshToken = account.refresh_token || ""
        token.expiresAt = account.expires_at || 0
        console.log("JWT callback - added tokens:", {
          hasAccessToken: !!token.accessToken,
          hasRefreshToken: !!token.refreshToken,
          expiresAt: token.expiresAt
        })
      }
      return token
    },
    async session({ session, token }) {
      console.log("Session callback - token keys:", Object.keys(token))
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string
      session.expiresAt = token.expiresAt as number
      console.log("Session callback - final session:", {
        hasUser: !!session.user,
        hasAccessToken: !!session.accessToken,
        hasRefreshToken: !!session.refreshToken
      })
      return session
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
} 