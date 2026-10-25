import { Platform } from "react-native";
import type * as ExpoIap from "expo-iap";
import type { Purchase, PurchaseError } from "expo-iap";
import { backend } from "./api";

// Store products. These ids are what the server accepts (api/plans.py
// STOREKIT_PRODUCTS / PLAY_PRODUCTS): App Store auto-renewable subscriptions
// for iOS, one Play subscription with two base plans for Android.
export const IOS_PRODUCTS = {
  monthly: "com.johnseong.dockit.pro.monthly",
  annual: "com.johnseong.dockit.pro.annual",
} as const;
export const PLAY_PRODUCT = "moldock_pro";
export const ANDROID_PACKAGE = "com.johnseong.dock_it";

export type PlanKey = "monthly" | "annual";
export const PLANS: PlanKey[] = ["monthly", "annual"];

export interface Offer {
  plan: PlanKey;
  sku: string;
  price: string; // localised by the store
  offerToken?: string; // Android base plan
}

export interface VerifyResult {
  tier: string;
  session_token?: string;
}

// expo-iap is a native module: absent in Expo Go and on web. Load it
// lazily so the rest of the app keeps working there.
function iap(): typeof ExpoIap | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    return require("expo-iap");
  } catch {
    return null;
  }
}

let connecting: Promise<boolean> | null = null;

export async function connect(): Promise<boolean> {
  const m = iap();
  if (!m) return false;
  if (!connecting) {
    connecting = m.initConnection().catch(() => {
      connecting = null;
      return false;
    });
  }
  return connecting;
}

export function isMoldockProduct(productId: string | undefined): boolean {
  if (!productId) return false;
  return productId === PLAY_PRODUCT || (Object.values(IOS_PRODUCTS) as string[]).includes(productId);
}

export async function loadOffers(): Promise<Offer[]> {
  const m = iap();
  if (!m || !(await connect())) return [];
  if (Platform.OS === "ios") {
    const items = await m.fetchProducts({ skus: Object.values(IOS_PRODUCTS), type: "subs" });
    return PLANS.flatMap((plan) => {
      const p = items.find((i) => i.id === IOS_PRODUCTS[plan]);
      return p ? [{ plan, sku: p.id, price: p.displayPrice }] : [];
    });
  }
  const items = await m.fetchProducts({ skus: [PLAY_PRODUCT], type: "subs" });
  const product = items.find((i) => i.id === PLAY_PRODUCT);
  if (!product || product.platform !== "android") return [];
  const details = product.subscriptionOfferDetailsAndroid ?? [];
  return PLANS.flatMap((plan) => {
    // The plain base plan (no promotional offer): the price shown is the
    // price charged, which is what the paywall's terms describe.
    const base =
      details.find((d) => d.basePlanId === plan && !d.offerId) ??
      details.find((d) => d.basePlanId === plan);
    if (!base) return [];
    const phases = base.pricingPhases?.pricingPhaseList ?? [];
    const price = phases[phases.length - 1]?.formattedPrice ?? product.displayPrice;
    return [{ plan, sku: PLAY_PRODUCT, price, offerToken: base.offerToken }];
  });
}

/** Starts the store sheet. The result arrives via the purchase listener. */
export async function buy(offer: Offer, appAccountToken?: string | null): Promise<void> {
  const m = iap();
  if (!m || !(await connect())) throw new Error("In-app purchases aren't available on this device.");
  const account = appAccountToken ?? undefined;
  await m.requestPurchase({
    type: "subs",
    request: {
      ios: { sku: offer.sku, appAccountToken: account },
      android: {
        skus: [offer.sku],
        subscriptionOffers: offer.offerToken ? [{ sku: offer.sku, offerToken: offer.offerToken }] : [],
        obfuscatedAccountIdAndroid: account,
      },
    },
  });
}

export function isPending(p: Purchase): boolean {
  // Play: 2 = PENDING (e.g. cash payment not yet made). Grants nothing yet.
  return p.platform === "android" && (p as any).purchaseStateAndroid === 2;
}

/** Sends the purchase to the server, which verifies it with Apple / Google
 * and upgrades the account. */
export async function verifyWithServer(p: Purchase): Promise<VerifyResult> {
  if (Platform.OS === "android") {
    const token = p.purchaseToken ?? (p as any).purchaseTokenAndroid;
    const resp = await backend.post("/api/play/verify", { purchase_token: token, product_id: p.productId });
    return resp.data;
  }
  const jws = p.purchaseToken ?? (p as any).jwsRepresentationIOS;
  const resp = await backend.post("/api/storekit/verify", { jws });
  return resp.data;
}

export async function finish(p: Purchase): Promise<void> {
  const m = iap();
  if (!m) return;
  try {
    await m.finishTransaction({ purchase: p, isConsumable: false });
  } catch {
    // Already finished / acknowledged (the server acknowledges Play too).
  }
}

export async function restore(): Promise<Purchase[]> {
  const m = iap();
  if (!m || !(await connect())) throw new Error("In-app purchases aren't available on this device.");
  const list = await m.restorePurchases({ onlyIncludeActiveItemsIOS: true });
  return list.filter((p) => isMoldockProduct(p.productId));
}

/** Purchases the store already knows about (renewals, other devices). */
export async function activePurchases(): Promise<Purchase[]> {
  const m = iap();
  if (!m || !(await connect())) return [];
  try {
    const list = await m.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    return list.filter((p) => isMoldockProduct(p.productId));
  } catch {
    return [];
  }
}

export function listen(
  onPurchase: (p: Purchase) => void,
  onError: (e: PurchaseError) => void
): () => void {
  const m = iap();
  if (!m) return () => {};
  const a = m.purchaseUpdatedListener(onPurchase);
  const b = m.purchaseErrorListener(onError);
  return () => {
    a.remove();
    b.remove();
  };
}

export function isUserCancel(e: { code?: string } | null | undefined): boolean {
  return e?.code === "E_USER_CANCELLED";
}

export async function manageSubscriptions(): Promise<void> {
  const m = iap();
  if (!m) return;
  await m.deepLinkToSubscriptions({ skuAndroid: PLAY_PRODUCT, packageNameAndroid: ANDROID_PACKAGE });
}
