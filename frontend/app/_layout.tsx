import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, LogBox, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/Toast";
import { queryClient } from "@/src/query-client";
import { initializeRevenueCat, SubscriptionProvider } from "@/src/revenuecat";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

function Gate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  if (loading) {
    return (
      <View testID="auth-loading" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimaryText} size="large" />
      </View>
    );
  }
  const ready = !!user && user.onboarded !== false;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="case/[id]" />
        <Stack.Screen name="chat/[threadId]" />
        <Stack.Screen name="template/[id]" />
        <Stack.Screen name="new-case" options={{ presentation: "modal" }} />
        <Stack.Screen name="forum/[id]" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="audits" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="admin-messages" />
        <Stack.Screen name="new-post" options={{ presentation: "modal" }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !ready}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // One app level ErrorBoundary; a render crash shows a reload screen instead of a blank app.
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <ToastProvider>
                  <StatusBar style="light" />
                  <Gate />
                </ToastProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
