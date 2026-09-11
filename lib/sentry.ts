// Crash / error reporting. Kept behind a lazy require + a DSN check so the app
// runs identically whether or not Sentry is configured: without an
// EXPO_PUBLIC_SENTRY_DSN (or in Expo Go) this is entirely inert, and the
// ErrorBoundary still shows its friendly fallback. Set the DSN in EAS env to
// turn real reporting on — no code change needed.
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let enabled = false;

export function initErrorReporting(): void {
  if (isExpoGo || !DSN) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn: DSN,
      // Lean config for a beta: capture errors, sample a little tracing.
      tracesSampleRate: 0.2,
      enableAutoSessionTracking: true,
    });
    enabled = true;
  } catch {
    enabled = false;
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Never let reporting throw into the app.
  }
}

export function isErrorReportingEnabled(): boolean {
  return enabled;
}
