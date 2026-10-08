import type { DefaultSession } from "next-auth";
import "next-auth/jwt";
declare module "next-auth" {
  interface User { sessionVersion: number }
  interface Session { user: DefaultSession["user"] & { id: string; sessionVersion: number } }
}
declare module "next-auth/jwt" { interface JWT { userId?: string; sessionVersion?: number } }
