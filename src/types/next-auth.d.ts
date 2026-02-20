import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ATHLETE" | "PARENT" | "COACH" | "ADMIN";
      age: number | null;
      position: string | null;
      competitionLevel: string | null;
      parentConsentVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: "ATHLETE" | "PARENT" | "COACH" | "ADMIN";
    age: number | null;
    position: string | null;
    competitionLevel: string | null;
    parentConsentVerified: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ATHLETE" | "PARENT" | "COACH" | "ADMIN";
    age: number | null;
    position: string | null;
    competitionLevel: string | null;
    parentConsentVerified: boolean;
  }
}
