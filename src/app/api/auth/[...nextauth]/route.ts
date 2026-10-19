import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { auditLoginRequest } from "@/lib/auth-audit";
import type { NextRequest } from "next/server";
const handler = NextAuth(authOptions);
export { handler as GET };
export async function POST(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  return auditLoginRequest(request, () => handler(request, context));
}
