import Foundation
import StoreKit

/// Signed-in MolDock account + MolDock Pro purchases (StoreKit 2).
/// Mirrors mobile/lib/AccountContext.tsx: the account UUID from the server
/// is the purchase's appAccountToken, every transaction is posted to
/// /api/storekit/verify (the server checks it with Apple and upgrades the
/// account), and it is finished only once the server has looked at it.
@MainActor
final class AccountStore: ObservableObject {
    enum Plan: String, CaseIterable, Identifiable {
        case monthly, annual
        var id: String { rawValue }
        var productID: String {
            switch self {
            case .monthly: return "com.johnseong.dockit.pro.monthly"
            case .annual:  return "com.johnseong.dockit.pro.annual"
            }
        }
        var name: String { self == .annual ? "Annual" : "Monthly" }
        var period: String { self == .annual ? "year" : "month" }
    }

    static let productIDs = Set(Plan.allCases.map(\.productID))

    @Published private(set) var ready = false
    @Published private(set) var account: AccountSummary?
    @Published private(set) var products: [Plan: Product]?   // nil = loading
    @Published private(set) var busy = false
    @Published var notice: String?
    @Published var error: String?

    private var updates: Task<Void, Never>?
    private var inFlight = Set<UInt64>()

    init() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result, quiet: false)
            }
        }
        Task { await start() }
    }

    deinit { updates?.cancel() }

    private func start() async {
        let a = await refresh()
        ready = true
        // Anything the store delivered while we weren't looking (a purchase
        // interrupted mid-flight, a server that was unreachable).
        for await result in Transaction.unfinished {
            await handle(result, quiet: true)
        }
        // Re-posting what the store holds keeps renewals (and purchases
        // from other devices) current; no server notifications needed.
        if a?.signedIn == true { await syncActive() }
    }

    @discardableResult
    func refresh() async -> AccountSummary? {
        do {
            let a: AccountSummary = try await Backend.get("/api/account")
            account = a
            return a
        } catch let e as Backend.Failure where e.status == 401 {
            Session.save(nil)
            account = try? await Backend.get("/api/account")
            return account
        } catch {
            return nil
        }
    }

    func loadProducts() async {
        do {
            let list = try await Product.products(for: Self.productIDs)
            var map: [Plan: Product] = [:]
            for plan in Plan.allCases {
                if let p = list.first(where: { $0.id == plan.productID }) { map[plan] = p }
            }
            products = map
        } catch {
            products = [:]
        }
    }

    // MARK: Sign-in

    func requestCode(email: String) async throws {
        let _: OK = try await Backend.post("/api/auth/request-link", ["email": email, "client": "app"])
    }

    func verifyCode(email: String, code: String) async throws {
        let reply: SessionReply = try await Backend.post("/api/auth/verify-code", ["email": email, "code": code])
        await signIn(sessionToken: reply.sessionToken)
    }

    /// dockit://auth?token=... from the sign-in email (via the web verify page).
    func open(url: URL) async {
        guard url.scheme == "dockit", url.host == "auth",
              let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "token" })?.value else { return }
        do {
            let reply: SessionReply = try await Backend.get(
                "/api/auth/verify?token=\(token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? token)")
            await signIn(sessionToken: reply.sessionToken)
            notice = "Signed in."
        } catch {
            self.error = (error as? Backend.Failure)?.detail ?? "This sign-in link is invalid, used or expired."
        }
    }

    private func signIn(sessionToken: String) async {
        Session.save(sessionToken)
        await refresh()
        // A subscription bought before signing in moves onto this account.
        await syncActive()
    }

    func signOut() async {
        let _: OK? = try? await Backend.post("/api/auth/logout")
        Session.save(nil)
        notice = nil
        error = nil
        await refresh()
    }

    // MARK: Purchases

    func purchase(_ plan: Plan) async {
        guard let product = products?[plan] else { return }
        error = nil
        notice = nil
        busy = true
        defer { busy = false }
        var options: Set<Product.PurchaseOption> = []
        if let raw = account?.appAccountToken, let uuid = UUID(uuidString: raw) {
            options.insert(.appAccountToken(uuid))
        }
        do {
            switch try await product.purchase(options: options) {
            case .success(let result):
                await handle(result, quiet: false)
            case .pending:
                notice = "Your purchase is pending approval. Pro unlocks as soon as it completes."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            self.error = error.localizedDescription.isEmpty ? "The purchase didn't go through." : error.localizedDescription
        }
    }

    func restore() async {
        error = nil
        notice = nil
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
        } catch StoreKitError.userCancelled {
            return
        } catch {
            self.error = "Couldn't restore purchases. Check that you're signed in to the App Store."
            return
        }
        var found = 0
        for await result in Transaction.currentEntitlements {
            guard Self.productIDs.contains(result.unsafePayloadValue.productID) else { continue }
            found += 1
            await handle(result, quiet: false)
        }
        if found == 0 {
            error = "No MolDock Pro subscription was found for this Apple ID."
        }
    }

    private func syncActive() async {
        for await result in Transaction.currentEntitlements
        where Self.productIDs.contains(result.unsafePayloadValue.productID) {
            await handle(result, quiet: true)
        }
    }

    /// Sends the signed transaction to the server, then finishes it.
    /// `quiet` is for background syncs at launch.
    private func handle(_ result: VerificationResult<Transaction>, quiet: Bool) async {
        let tx = result.unsafePayloadValue
        guard Self.productIDs.contains(tx.productID), !inFlight.contains(tx.id) else { return }
        inFlight.insert(tx.id)
        defer { inFlight.remove(tx.id) }
        do {
            let reply: PurchaseReply = try await Backend.post("/api/storekit/verify", ["jws": result.jwsRepresentation])
            if let token = reply.sessionToken { Session.save(token) }
            await tx.finish()
            await refresh()
            if !quiet {
                error = nil
                notice = "MolDock Pro is active. Thank you!"
            }
        } catch {
            let failure = error as? Backend.Failure
            // The server looked at it and said no (expired, another account):
            // finishing is safe and stops the store re-delivering it. On a
            // network / server error keep it for the next launch.
            if failure?.isRejection == true { await tx.finish() }
            if !quiet {
                notice = nil
                self.error = failure?.isRejection == true
                    ? (failure?.detail ?? "This purchase couldn't be applied to your account.")
                    : "Couldn't confirm the purchase with MolDock. It will be applied automatically next time you open the app."
            }
        }
    }
}
