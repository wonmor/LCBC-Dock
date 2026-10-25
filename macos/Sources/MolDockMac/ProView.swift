import SwiftUI
import StoreKit

/// MolDock Pro paywall. Same plans, wording and terms as mobile/app/pro.tsx.
struct ProView: View {
    @EnvironmentObject private var store: AccountStore
    var showAccount: () -> Void

    @State private var selected: AccountStore.Plan = .annual
    @State private var proLimits = PlanLimits.proFallback
    @State private var freeLimits: PlanLimits?

    static let privacyURL = URL(string: "https://wonmor.github.io/LCBC-Dock/privacy.html")!
    static let eulaURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let manageURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    private var features: [(String, String)] {
        let p = proLimits, f = freeLimits
        func free(_ v: Int?) -> String { v.map { " (Free: \($0))" } ?? "" }
        return [
            ("bolt", "\(p.jobsPerDay ?? 300) dockings a day\(free(f?.jobsPerDay))"),
            ("slider.horizontal.3", "Exhaustiveness up to \(p.maxExhaustiveness ?? 32)\(free(f?.maxExhaustiveness))"),
            ("ruler", "Up to \(p.maxNumModes ?? 20) poses and \(Int(p.maxBoxEdge ?? 40)) Å search boxes"),
            ("tray.full", "Batch screening, up to \(p.maxBatchLigands ?? 500) ligands"),
            ("lock", "Private jobs, kept until you delete them"),
            ("hare", "Priority queue"),
            ("key", "REST API keys and Pro on the web app and iPhone"),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                (Text("MolDock ").fontWeight(.light) + Text("Pro").fontWeight(.semibold))
                    .font(.system(.largeTitle, design: .rounded))
                Text("Serious docking on every device you use. Free stays free.")
                    .font(.system(.body, design: .rounded))
                    .foregroundColor(.secondary)

                card {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(features, id: \.1) { icon, text in
                            Label {
                                Text(text)
                            } icon: {
                                Image(systemName: icon).foregroundColor(.secondary).frame(width: 18)
                            }
                            .font(.system(.body, design: .rounded))
                        }
                    }
                }

                purchaseSection

                if let notice = store.notice {
                    Text(notice).foregroundColor(.green).font(.callout)
                }
                if let error = store.error {
                    Text(error).foregroundColor(.red).font(.callout)
                }

                Button("Restore Purchases") { Task { await store.restore() } }
                    .buttonStyle(.link)
                    .disabled(store.busy)

                Text(terms)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    Link("Privacy Policy", destination: Self.privacyURL)
                    Text("|").foregroundColor(.secondary)
                    Link("Terms of Use (EULA)", destination: Self.eulaURL)
                }
                .font(.caption)
            }
            .frame(maxWidth: 560, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .task {
            store.error = nil
            store.notice = nil
            await store.loadProducts()
        }
        .task {
            if let pricing: Pricing = try? await Backend.get("/api/pricing") {
                proLimits = pricing.tiers["pro"]?.limits ?? PlanLimits.proFallback
                freeLimits = pricing.tiers["free"]?.limits
            }
        }
    }

    @ViewBuilder
    private var purchaseSection: some View {
        if store.account?.isPaid == true {
            card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("You're on MolDock Pro").font(.system(.title3, design: .rounded).weight(.medium))
                    Text(store.account?.sources.contains("stripe") == true
                         ? "Billed through the MolDock website."
                         : store.account?.sources.contains("google_play") == true
                         ? "Billed through Google Play."
                         : "Billed through your Apple ID.")
                        .foregroundColor(.secondary)
                    if store.account?.sources.contains("app_store") == true {
                        Link("Manage subscription", destination: Self.manageURL)
                            .buttonStyle(.bordered)
                    }
                }
            }
        } else if let products = store.products {
            if products.isEmpty {
                Text("Subscriptions aren't available right now. Check your connection and that you're signed in to the App Store, then try again.")
                    .foregroundColor(.secondary)
            } else {
                VStack(spacing: 10) {
                    ForEach(AccountStore.Plan.allCases) { plan in
                        if let product = products[plan] {
                            planRow(plan, product)
                        }
                    }
                }

                if store.account?.email == nil {
                    Button("Sign in first so Pro also works on the web and your other devices.", action: showAccount)
                        .buttonStyle(.link)
                        .font(.callout)
                }

                let plan = products[selected] != nil ? selected : (products.keys.first ?? selected)
                Button {
                    Task { await store.purchase(plan) }
                } label: {
                    Text(store.busy ? "Working..." : "Subscribe for \(products[plan]?.displayPrice ?? "") / \(plan.period)")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(store.busy || products[plan] == nil)
            }
        } else {
            ProgressView("Loading plans...")
        }
    }

    private func planRow(_ plan: AccountStore.Plan, _ product: Product) -> some View {
        let active = plan == selected
        return Button { selected = plan } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.name).font(.system(.headline, design: .rounded))
                    Text("\(product.displayPrice) per \(plan.period)").foregroundColor(.secondary)
                }
                Spacer()
                if active { Image(systemName: "checkmark") }
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .contentShape(Rectangle())
            .overlay(RoundedRectangle(cornerRadius: 14)
                .stroke(active ? Color.primary : Color.primary.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var terms: String {
        var prices = ""
        if let m = store.products?[.monthly], let a = store.products?[.annual] {
            prices = " (\(m.displayPrice) per month or \(a.displayPrice) per year)"
        }
        return "MolDock Pro is an auto-renewing subscription\(prices). Payment is charged to your Apple ID when you confirm the purchase. The subscription renews automatically for the same period and price unless it is cancelled at least 24 hours before the end of the current period; your account is charged for the renewal within the 24 hours before the period ends. You can manage or cancel it at any time in your Apple ID's Subscriptions settings. Cancelling keeps Pro until the end of the period you've paid for."
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.12), lineWidth: 1))
    }
}
