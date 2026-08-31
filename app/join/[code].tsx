import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

/**
 * Deep-link join target: `quorum://join/<code>` (see lib/invite.ts). Auto-joins
 * the plan via the joinPlanByCode Cloud Function, then routes to the plan.
 * Unauthenticated users are sent to login (the code is still in the invite
 * message for manual entry on the Join-by-code card).
 */
export default function JoinByLink() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const raw = Array.isArray(params.code) ? params.code[0] : params.code;
    const code = (raw || '').trim().toUpperCase();

    (async () => {
      if (!code) {
        setError('This invite link is missing its code.');
        return;
      }
      if (!auth.currentUser) {
        // Root layout gates unauthenticated users; send them to sign in. The
        // invite message includes the code so they can join after signing in.
        router.replace('/(auth)/login');
        return;
      }
      try {
        const join = httpsCallable<{ code: string }, { planId: string }>(functions, 'joinPlanByCode');
        const { data } = await join({ code });
        router.replace({ pathname: '/plan-detail', params: { id: data.planId } });
      } catch (e: any) {
        setError(e?.message || "That invite link didn't work.");
      }
    })();
  }, [params.code, router]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.title}>Couldn&apos;t join</Text>
          <Text style={styles.message}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Go home"
          >
            <Text style={styles.buttonText}>Go home</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator color={Colors.text} />
          <Text style={styles.message}>Joining plan...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeight.medium,
  },
  button: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  buttonText: {
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
});
