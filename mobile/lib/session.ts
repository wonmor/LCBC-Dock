import * as SecureStore from "expo-secure-store";

// The MolDock session token (mds_...) lives in the Keychain / Keystore.
// It is mirrored in memory so the axios interceptor can read it
// synchronously on every backend request.
const SESSION_KEY = "moldock.session";

let sessionToken: string | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

export async function loadSession(): Promise<string | null> {
  try {
    sessionToken = await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    sessionToken = null;
  }
  return sessionToken;
}

export async function saveSession(token: string | null): Promise<void> {
  sessionToken = token;
  try {
    if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Keychain unavailable: the session still works until the app quits.
  }
}
