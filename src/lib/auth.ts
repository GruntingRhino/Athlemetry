import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  checkDatabaseRateLimit,
  getDatabaseRateLimitStatus,
  rateLimitSource,
  resetDatabaseRateLimit,
} from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";

const DUMMY_PASSWORD_HASH = "$2b$12$usH8ebLU.TIO/Ip6eFdXauTw.1xfv9mNWRgfAgaDq5a.lKxAy5Uau";

export async function authorizeCredentials(
  credentials: { email?: string; password?: string } | undefined,
  request: { headers?: Headers | Record<string, string | string[] | undefined> },
) {
  try {
    const source = rateLimitSource(request.headers ?? {});
    const sourceLimit = await checkDatabaseRateLimit({
      namespace: "login-source",
      identifier: source,
      windowMs: 15 * 60_000,
      maxRequests: 50,
    });
    if (!sourceLimit.allowed) return null;
  } catch {
    return null;
  }

  if (!credentials?.email || !credentials.password) return null;
  const email = credentials.email.trim().toLowerCase();
  try {
    const accountLimit = await getDatabaseRateLimitStatus({
      namespace: "login-account-failure",
      identifier: email,
      windowMs: 15 * 60_000,
      maxRequests: 10,
    });
    if (accountLimit.blocked) {
      await bcrypt.compare(credentials.password, DUMMY_PASSWORD_HASH);
      return null;
    }
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const usableUser = user && !user.deletedAt ? user : null;
  const isValid = await bcrypt.compare(credentials.password, usableUser?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!usableUser || !isValid) {
    try {
      await checkDatabaseRateLimit({
        namespace: "login-account-failure",
        identifier: email,
        windowMs: 15 * 60_000,
        maxRequests: 10,
      });
    } catch {
      // Authentication already failed; never bypass protection because its persistence failed.
    }
    return null;
  }

  try {
    await resetDatabaseRateLimit({ namespace: "login-account-failure", identifier: email });
  } catch {
    return null;
  }

  return {
    id: usableUser.id,
    email: usableUser.email,
    name: usableUser.name,
    role: usableUser.role,
    age: usableUser.age,
    position: usableUser.position,
    competitionLevel: usableUser.competitionLevel,
    parentConsentVerified: usableUser.parentConsentVerified,
  };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        return authorizeCredentials(credentials, request);
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
    updateAge: 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.age = user.age;
        token.position = user.position;
        token.competitionLevel = user.competitionLevel;
        token.parentConsentVerified = user.parentConsentVerified;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.age = token.age;
        session.user.position = token.position;
        session.user.competitionLevel = token.competitionLevel;
        session.user.parentConsentVerified = token.parentConsentVerified;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
