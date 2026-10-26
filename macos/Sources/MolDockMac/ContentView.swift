import SwiftUI

/// Sidebar + detail. Every section is native and talks to the same MolDock
/// backend as the web and iPhone apps.
struct ContentView: View {
    @EnvironmentObject private var store: AccountStore
    @EnvironmentObject private var app: AppModel

    var body: some View {
        NavigationSplitView {
            List(AppModel.Section.allCases, selection: $app.section) { s in
                Label(s.rawValue, systemImage: s.systemImage).tag(s as AppModel.Section?)
            }
            .navigationTitle("MolDock")
            .frame(minWidth: 200)
            .safeAreaInset(edge: .bottom) { planFooter }
        } detail: {
            switch app.section {
            case .examples: ExamplesView()
            case .dock: DockView()
            case .screen: ScreenView()
            case .results: ResultsView()
            case .pro: ProView(showAccount: { app.section = .account })
            case .account: AccountView(showPro: { app.section = .pro })
            case .about: AboutView()
            case .none: Text("Pick a section").foregroundColor(.secondary)
            }
        }
        // dockit:// links reuse this window instead of opening another.
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        .onOpenURL { url in
            Task { await store.open(url: url) }
            app.section = .account
        }
    }

    @ViewBuilder
    private var planFooter: some View {
        if let a = store.account {
            VStack(alignment: .leading, spacing: 2) {
                Text(a.email ?? "Not signed in").font(.caption).lineLimit(1)
                if let u = a.usage {
                    Text(a.email == nil ? "\(u.usedToday) of \(u.jobsPerDay) dockings today"
                                        : "\(a.tierLabel) | \(u.usedToday) of \(u.jobsPerDay) today")
                        .font(.caption2).foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
        }
    }
}
