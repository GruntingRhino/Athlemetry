type SeedEnvironment = Record<string, string | undefined>;

export function resolveSeedAdmin(environment: SeedEnvironment) {
  const email = environment.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = environment.SEED_ADMIN_PASSWORD;

  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be provided.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("SEED_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 16) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 16 characters.");
  }

  return { email, password };
}
