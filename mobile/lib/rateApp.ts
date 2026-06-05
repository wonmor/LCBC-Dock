import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// One key, storing the app version we last prompted on. We ask at most
// once per released version — the OS additionally rate-limits the native
// dialog (iOS ~3x/year), so this just stops us re-attempting every time.
const PROMPTED_VERSION_KEY = "rateApp:promptedVersion";

/**
 * Ask the OS to show its native "rate this app" prompt after a genuine
 * win (e.g. a docking job's results just loaded). Best-effort and
 * completely silent on failure — a review prompt must never interrupt or
 * break the actual flow.
 *
 * Gates:
 *  - only once per app version (per device)
 *  - only when the platform actually has a review action available
 *    (no-op in the simulator, Expo Go, or if the user disabled it)
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    const version = Constants.expoConfig?.version ?? "unknown";

    const lastPrompted = await AsyncStorage.getItem(PROMPTED_VERSION_KEY);
    if (lastPrompted === version) return;

    // hasAction() is true only when requestReview() will actually do
    // something on this device/build.
    const canReview = await StoreReview.hasAction();
    if (!canReview) return;

    await StoreReview.requestReview();
    // Mark as prompted regardless of whether the user rated — the system
    // dialog gives no callback, and we don't want to nag on every success.
    await AsyncStorage.setItem(PROMPTED_VERSION_KEY, version);
  } catch {
    // Swallow — never let the review prompt affect the app.
  }
}
