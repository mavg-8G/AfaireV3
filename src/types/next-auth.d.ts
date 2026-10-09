import type { DefaultSession } from "next-auth";
import "next-auth/jwt";
declare module "next-auth" {
  interface User { sessionVersion: number; deviceSessionId: string }
  interface Session { user: DefaultSession["user"] & { id: string; sessionVersion: number; deviceSessionId: string } }
}
declare module "next-auth/jwt" { interface JWT { userId?: string; sessionVersion?: number; deviceSessionId?: string } }
