import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { LoginFormSchema } from "./definitions";
import { allowAttempt, allowClientAttempt } from "./access";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [CredentialsProvider({
    name: "Email y contraseña",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials, request) {
      if (!await allowClientAttempt(request.headers?.["x-afaire-client-ip"], "login")) return null;
      const parsed = LoginFormSchema.safeParse(credentials);
      if (!parsed.success || !await allowAttempt(`login:${parsed.data.email}`)) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
      if (!user || !valid) return null;
      return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.userId = user.id; token.sessionVersion = user.sessionVersion; }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.sessionVersion = token.sessionVersion as number;
      return session;
    },
  },
};
