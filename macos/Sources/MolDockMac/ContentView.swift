import SwiftUI

/// Two-pane scaffold matching the iOS MolDock feature set. Real
/// docking logic is a multi-week port — for now each sidebar item
/// hosts a PlaceholderView that explains what'll live there and
/// links out to the web app for users who need it today.
struct ContentView: View {
    enum Section: String, CaseIterable, Identifiable {
        case search = "Search"
        case docking = "Docking"
        case results = "Results"
        case about = "About"

        var id: String { rawValue }
        var systemImage: String {
            switch self {
            case .search:  return "magnifyingglass"
            case .docking: return "atom"
            case .results: return "list.bullet.rectangle"
            case .about:   return "info.circle"
            }
        }
        var blurb: String {
            switch self {
            case .search:
                return "Look up proteins from PDB + small molecules from PubChem. iOS already does this; the Mac search UI lives here."
            case .docking:
                return "Configure AutoDock Vina parameters and run a docking job. The server-side runner is shared with iOS; we just need the SwiftUI form."
            case .results:
                return "Visualize binding poses + scores in a native 3D viewer. SceneKit candidate; RealityKit on macOS gets brittle outside immersive contexts."
            case .about:
                return "Credits, version, support links."
            }
        }
    }

    @State private var section: Section? = .search

    var body: some View {
        NavigationSplitView {
            List(Section.allCases, selection: $section) { s in
                Label(s.rawValue, systemImage: s.systemImage).tag(s as Section?)
            }
            .navigationTitle("MolDock")
            .frame(minWidth: 200)
        } detail: {
            if let s = section {
                PlaceholderView(section: s)
            } else {
                Text("Pick a section").foregroundColor(.secondary)
            }
        }
    }
}

private struct PlaceholderView: View {
    let section: ContentView.Section

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(section.rawValue)
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
            Text(section.blurb)
                .font(.system(.body, design: .rounded))
                .foregroundColor(.secondary)
                .lineSpacing(3)
                .frame(maxWidth: 560, alignment: .leading)

            Divider().padding(.vertical, 4)

            Text("Beta — using the iOS / web app in the meantime")
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
            Text("The Mac native UI is in active development. While we build it out, you can use the iOS MolDock or the full web app — both share the same docking backend, so jobs you start there will work in either client.")
                .font(.system(.body, design: .rounded))
                .foregroundColor(.secondary)
                .lineSpacing(3)
                .frame(maxWidth: 620, alignment: .leading)

            HStack(spacing: 14) {
                Link("Open web app", destination: URL(string: "https://lcbc-server.apps.johnseong.com")!)
                    .buttonStyle(.borderedProminent)
                Link("iOS app on App Store", destination: URL(string: "https://apps.apple.com/us/app/protein-ligand-dock/id6761741448")!)
                    .buttonStyle(.bordered)
            }
            .controlSize(.large)

            Spacer()
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
