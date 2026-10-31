import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { AccountProvider } from "@/lib/AccountContext";
import { Header } from "@/components/Bauhaus";
import { fontFiles, palette } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, failed] = useFonts(fontFiles);

  useEffect(() => {
    if (loaded || failed) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, failed]);

  if (!loaded && !failed) return null;

  return (
    <AccountProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          header: ({ navigation, options, back }) => (
            <Header
              title={typeof options.headerTitle === "string" ? options.headerTitle : ""}
              canGoBack={!!back}
              onBack={() => navigation.goBack()}
            />
          ),
          contentStyle: { backgroundColor: palette.ground },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="examples" options={{ headerTitle: "Examples" }} />
        <Stack.Screen name="docking/protein" options={{ headerTitle: "Protein" }} />
        <Stack.Screen name="docking/marinate" options={{ headerTitle: "Prepare" }} />
        <Stack.Screen name="docking/ligand" options={{ headerTitle: "Ligand" }} />
        <Stack.Screen name="docking/cook" options={{ headerTitle: "Dock" }} />
        <Stack.Screen name="dashboard" options={{ headerTitle: "Dashboard" }} />
        <Stack.Screen name="results/[jobId]" options={{ headerTitle: "Results" }} />
        <Stack.Screen name="about" options={{ headerTitle: "About" }} />
        <Stack.Screen name="account" options={{ headerTitle: "Account" }} />
        <Stack.Screen name="pro" options={{ headerTitle: "MolDock Pro" }} />
        <Stack.Screen name="auth" options={{ headerTitle: "Sign in" }} />
      </Stack>
    </AccountProvider>
  );
}
