import { Stack } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';

export default function AuthLayout() {
  const Colors = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="complete-profile" />
    </Stack>
  );
}
