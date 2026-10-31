import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import type { Purchase } from "expo-iap";
import { loadSession, saveSession } from "./session";
import { AccountSummary, deleteAccountOnServer, errorText, fetchAccount, signOutOnServer } from "./account";
import * as Store from "./purchases";

interface AccountState {
  ready: boolean;
  account: AccountSummary | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
  refresh: () => Promise<AccountSummary | null>;
  signIn: (sessionToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Deletes the account on the server, then forgets the session. Throws on failure. */
  deleteAccount: () => Promise<{ storeSubscriptionActive: boolean }>;
  purchase: (offer: Store.Offer) => Promise<void>;
  restore: () => Promise<void>;
  clearMessages: () => void;
}

const AccountContext = createContext<AccountState | null>(null);

const STORE_NAME = Platform.OS === "ios" ? "Apple ID" : "Google account";

export function AccountProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const a = await fetchAccount();
      setAccount(a);
      return a;
    } catch (e: any) {
      if (e?.response?.status === 401) await saveSession(null);
      return null;
    }
  }, []);

  // Verify a store purchase with the server (which asks Apple / Google),
  // then finish it. `quiet` is for background syncs at launch.
  const handlePurchase = useCallback(
    async (p: Purchase, quiet = false) => {
      const key = p.purchaseToken ?? p.id;
      if (!key || inFlight.current.has(key)) return;
      if (Store.isPending(p)) {
        if (!quiet) setNotice("Your payment is pending. Pro unlocks as soon as it completes.");
        return;
      }
      inFlight.current.add(key);
      try {
        const result = await Store.verifyWithServer(p);
        if (result.session_token) await saveSession(result.session_token);
        await Store.finish(p);
        await refresh();
        if (!quiet) {
          setError(null);
          setNotice("MolDock Pro is active. Thank you!");
        }
      } catch (e: any) {
        const status = e?.response?.status ?? 0;
        // The server looked at it and said no (expired, another account):
        // finishing is safe and stops the store re-delivering it. On a
        // network / server error keep it for the next launch.
        if (status >= 400 && status < 500) await Store.finish(p);
        if (!quiet) {
          setNotice(null);
          setError(
            status >= 400 && status < 500
              ? errorText(e, "This purchase couldn't be applied to your account.")
              : "Couldn't confirm the purchase with MolDock. It will be applied automatically next time you open the app."
          );
        }
      } finally {
        inFlight.current.delete(key);
        setBusy(false);
      }
    },
    [refresh]
  );

  const syncActive = useCallback(async () => {
    for (const p of await Store.activePurchases()) await handlePurchase(p, true);
  }, [handlePurchase]);

  useEffect(() => {
    let stop = () => {};
    (async () => {
      await loadSession();
      const a = await refresh();
      setReady(true);
      stop = Store.listen(
        (p) => {
          if (Store.isMoldockProduct(p.productId)) handlePurchase(p);
        },
        (e) => {
          setBusy(false);
          if (!Store.isUserCancel(e)) setError(e?.message || "The purchase didn't go through.");
        }
      );
      // No server notifications are needed: re-posting what the store
      // holds keeps renewals (and purchases from other devices) current.
      if (a?.signed_in) syncActive();
    })();
    return () => stop();
  }, [refresh, handlePurchase, syncActive]);

  const signIn = useCallback(
    async (sessionToken: string) => {
      await saveSession(sessionToken);
      await refresh();
      // A subscription bought before signing in moves onto this account.
      await syncActive();
    },
    [refresh, syncActive]
  );

  const signOut = useCallback(async () => {
    await signOutOnServer();
    await saveSession(null);
    setNotice(null);
    setError(null);
    await refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async () => {
    const result = await deleteAccountOnServer();
    await saveSession(null);
    setNotice(null);
    setError(null);
    await refresh();
    return result;
  }, [refresh]);

  const purchase = useCallback(
    async (offer: Store.Offer) => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        await Store.buy(offer, account?.app_account_token);
      } catch (e: any) {
        setBusy(false);
        if (!Store.isUserCancel(e)) setError(e?.message || "The purchase didn't go through.");
      }
    },
    [account]
  );

  const restore = useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const found = await Store.restore();
      if (found.length === 0) {
        setError(`No MolDock Pro subscription was found for this ${STORE_NAME}.`);
      } else {
        for (const p of found) await handlePurchase(p);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't restore purchases.");
    } finally {
      setBusy(false);
    }
  }, [handlePurchase]);

  const clearMessages = useCallback(() => {
    setNotice(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ ready, account, busy, notice, error, refresh, signIn, signOut, deleteAccount, purchase, restore, clearMessages }),
    [ready, account, busy, notice, error, refresh, signIn, signOut, deleteAccount, purchase, restore, clearMessages]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
