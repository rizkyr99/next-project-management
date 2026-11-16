import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Refuse to start a production server with a broken environment; in
    // development just say what's wrong.
    if (!process.env.SKIP_ENV_VALIDATION) {
      const { checkServerEnv, formatEnvProblems } = await import("./lib/env");
      const envCheck = checkServerEnv();
      if (!envCheck.ok) {
        const message = formatEnvProblems(envCheck.problems);
        if (process.env.NODE_ENV === "production") throw new Error(message);
        console.warn(`\n⚠️  ${message}\n`);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
