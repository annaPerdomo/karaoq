export function databaseRoleWarning(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  // Vercel sets NODE_ENV=production on every build, previews included;
  // VERCEL_ENV is what actually distinguishes them.
  const nonProduction = env.NODE_ENV !== "production" || env.VERCEL_ENV === "preview";
  if (
    nonProduction &&
    env.MONGODB_DB === "karaoq" &&
    env.KARAOQ_ALLOW_PROD_DB !== "1"
  ) {
    return `Non-production process (NODE_ENV=${env.NODE_ENV ?? "unset"}, VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}) is pointed at MONGODB_DB=karaoq, the production database. Set MONGODB_DB to a separate dev database (e.g. karaoq_dev), or set KARAOQ_ALLOW_PROD_DB=1 to proceed anyway.`;
  }
  return null;
}
