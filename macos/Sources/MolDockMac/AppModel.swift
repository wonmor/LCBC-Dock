import Foundation
import SwiftUI
import AppKit
import UniformTypeIdentifiers

enum ResultsRoute: Hashable {
    case job(String)
    case batch(String)
}

/// A docking set up from an example (or anywhere else) and handed to Dock.
struct DockDraft: Equatable {
    var protein: String
    var ligandCid: Int
    var ligandName: String
}

/// App-wide navigation + the jobs this Mac submitted (so signed-out users
/// still find their results; signed-in users also get /api/account/jobs).
@MainActor
final class AppModel: ObservableObject {
    enum Section: String, CaseIterable, Identifiable {
        case examples = "Examples"
        case dock = "Dock"
        case screen = "Screen"
        case results = "Results"
        case pro = "MolDock Pro"
        case account = "Account"
        case about = "About"

        var id: String { rawValue }
        var systemImage: String {
            switch self {
            case .examples: return "books.vertical"
            case .dock:     return "atom"
            case .screen:   return "chart.bar.doc.horizontal"
            case .results:  return "doc.text.magnifyingglass"
            case .pro:      return "sparkles"
            case .account:  return "person"
            case .about:    return "text.book.closed"
            }
        }
    }

    @Published var section: Section? = .examples
    @Published var dockDraft: DockDraft?
    @Published var resultsPath: [ResultsRoute] = []
    @Published private(set) var localJobs: [String] = []
    @Published private(set) var localBatches: [String] = []

    private let jobsKey = "moldock.localJobs"
    private let batchesKey = "moldock.localBatches"

    init() {
        localJobs = UserDefaults.standard.stringArray(forKey: jobsKey) ?? []
        localBatches = UserDefaults.standard.stringArray(forKey: batchesKey) ?? []
        #if DEBUG
        // Screenshot / QA hooks: -MolDockSection dock, -MolDockJob <id>,
        // -MolDockBatch <id>, -MolDockDraft 1HSG:5362440:Indinavir
        let d = UserDefaults.standard
        if let s = d.string(forKey: "MolDockSection"), let sec = Section.allCases.first(where: { "\($0)" == s }) {
            section = sec
        }
        if let job = d.string(forKey: "MolDockJob") { section = .results; resultsPath = [.job(job)] }
        if let batch = d.string(forKey: "MolDockBatch") { section = .results; resultsPath = [.batch(batch)] }
        if let draft = d.string(forKey: "MolDockDraft")?.split(separator: ":"), draft.count == 3 {
            dockDraft = DockDraft(protein: String(draft[0]), ligandCid: Int(draft[1]) ?? 0, ligandName: String(draft[2]))
            section = .dock
        }
        #endif
    }

    func openJob(_ id: String, remember: Bool = true) {
        if remember { rememberJob(id) }
        section = .results
        resultsPath = [.job(id)]
    }

    func openBatch(_ id: String) {
        if !localBatches.contains(id) {
            localBatches.insert(id, at: 0)
            localBatches = Array(localBatches.prefix(100))
            UserDefaults.standard.set(localBatches, forKey: batchesKey)
        }
        section = .results
        resultsPath = [.batch(id)]
    }

    func dock(_ draft: DockDraft) {
        dockDraft = draft
        section = .dock
    }

    private func rememberJob(_ id: String) {
        guard !localJobs.contains(id) else { return }
        localJobs.insert(id, at: 0)
        localJobs = Array(localJobs.prefix(200))
        UserDefaults.standard.set(localJobs, forKey: jobsKey)
    }

    func forget(job id: String) {
        localJobs.removeAll { $0 == id }
        UserDefaults.standard.set(localJobs, forKey: jobsKey)
    }
}

/// Error text plus whether it is a plan limit (shows the Pro button).
struct ShownError: Equatable {
    var message: String
    var paywall: Bool

    init(_ error: Error, fallback: String) {
        if let f = error as? Backend.Failure {
            message = f.errorDescription ?? fallback
            paywall = f.paywall && f.status != 401
        } else {
            message = fallback
            paywall = false
        }
    }

    init(message: String, paywall: Bool = false) {
        self.message = message
        self.paywall = paywall
    }
}

struct ErrorLine: View {
    let error: ShownError
    @EnvironmentObject private var app: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(error.message)
                .foregroundColor(.red)
                .fixedSize(horizontal: false, vertical: true)
            if error.paywall {
                Button("See MolDock Pro") { app.section = .pro }
                    .buttonStyle(.bordered)
            }
        }
        .font(.callout)
    }
}

/// Bordered panel used across the app (same look as the web cards).
struct Card<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title).font(.system(.headline, design: .rounded))
            }
            content
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.12), lineWidth: 1))
    }
}

struct PageTitle: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(.largeTitle, design: .rounded).weight(.semibold))
            if let subtitle {
                Text(subtitle).font(.system(.body, design: .rounded)).foregroundColor(.secondary)
            }
        }
    }
}

enum FilePanels {
    static func open(types: [String]) -> URL? {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = types.compactMap { UTType(filenameExtension: $0) }
        return panel.runModal() == .OK ? panel.url : nil
    }

    static func save(_ data: Data, name: String) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url {
            try? data.write(to: url)
        }
    }
}
