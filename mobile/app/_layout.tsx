import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontSize: 14, fontWeight: "300" },
          headerBackTitle: "Back",
          contentStyle: { backgroundColor: "#000" },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerTitle: "",
            headerTransparent: true,
          }}
        />
        <Stack.Screen name="examples" options={{ headerTitle: "Examples" }} />
        <Stack.Screen name="docking/protein" options={{ headerTitle: "Protein" }} />
        <Stack.Screen name="docking/marinate" options={{ headerTitle: "Prepare" }} />
        <Stack.Screen name="docking/ligand" options={{ headerTitle: "Ligand" }} />
        <Stack.Screen name="docking/cook" options={{ headerTitle: "Dock" }} />
        <Stack.Screen name="dashboard" options={{ headerTitle: "Dashboard" }} />
        <Stack.Screen name="results/[jobId]" options={{ headerTitle: "Results" }} />
        <Stack.Screen name="about" options={{ headerTitle: "About" }} />
      </Stack>
    </>
  );
}
