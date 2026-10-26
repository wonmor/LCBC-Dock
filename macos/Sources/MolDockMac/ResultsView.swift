import SwiftUI

/// Jobs and screens: the account's history (/api/account/jobs) plus the
/// ones submitted from this Mac while signed out.
struct ResultsView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        NavigationStack(path: $app.resultsPath) {
            ResultsList()
                .navigationDestination(for: ResultsRoute.self) { route in
                    switch route {
                    case .job(let id): JobDetailView(jobID: id)
                    case .batch(let id): BatchDetailView(batchID: id)
                    }
                }
        }
    }
}

private struct ResultsList: View {
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var store: AccountStore

    @State private var jobs: [JobRow] = []
    @State private var batches: [BatchRow] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .bottom) {
                    PageTitle(title: "Results", subtitle: store.account?.email.map { "Jobs for \($0) and this Mac." }
                              ?? "Jobs started on this Mac. Sign in to see your jobs from the web and iPhone too.")
                    Spacer()
                    Button {
                        Task { await load() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(loading)
                }
                if let error { Text(error).foregroundColor(.red) }

                if !batches.isEmpty {
                    Card(title: "Screens") {
                        ForEach(batches) { b in
                            Button { app.resultsPath.append(.batch(b.batchId)) } label: {
                                HStack {
                                    Image(systemName: "chart.bar.doc.horizontal").foregroundColor(.secondary)
                                    Text(b.name ?? "Screen vs \(b.proteinPdbId)").fontWeight(.medium)
                                    Text("\(b.nLigands ?? 0) ligands").foregroundColor(.secondary)
                                    Spacer()
                                    Text(Format.date(b.createdAt)).foregroundColor(.secondary).monospacedDigit()
                                    Image(systemName: "chevron.right").foregroundColor(.secondary)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }

                Card(title: "Dockings") {
                    if jobs.isEmpty {
                        if loading {
                            ProgressView()
                        } else {
                            Text("No jobs yet. Start one from Examples or Dock.").foregroundColor(.secondary)
                        }
                    } else {
                        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
                            GridRow {
                                Text("Ligand"); Text("Protein"); Text("Status"); Text("Best (kcal/mol)"); Text("Started"); Text("")
                            }
                            .font(.caption).foregroundColor(.secondary)
                            ForEach(jobs) { j in
                                GridRow {
                                    Button(j.ligandName) { app.resultsPath.append(.job(j.jobId)) }
                                        .buttonStyle(.link)
                                    Text(j.proteinPdbId).font(.body.monospaced())
                                    Text(Format.statusLabel(j.status))
                                        .foregroundColor(j.status == "failed" ? .red : j.status == "completed" ? .primary : .orange)
                                    Text(Format.kcal(j.bestAffinity)).monospacedDigit()
                                    Text(Format.date(j.createdAt)).foregroundColor(.secondary).monospacedDigit()
                                    if j.visibility == "private" {
                                        Image(systemName: "lock").foregroundColor(.secondary).help("Private")
                                    } else {
                                        Text("")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: 900, alignment: .leading)
            .padding(32)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .task(id: "\(store.account?.email ?? "")-\(app.localJobs.count)") { await load() }
    }

    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        var rows: [JobRow] = []
        var bs: [BatchRow] = []
        if store.account?.signedIn == true, let mine: MyJobs = try? await Backend.get("/api/account/jobs") {
            rows = mine.jobs
            bs = mine.batches
        }
        let known = Set(rows.map(\.jobId))
        // Jobs from this Mac the account list doesn't have (signed out, or
        // before signing in).
        await withTaskGroup(of: JobRow?.self) { group in
            for id in app.localJobs.prefix(60) where !known.contains(id) {
                group.addTask {
                    guard let s: JobStatus = try? await Backend.get("/api/jobs/\(id)") else { return nil }
                    return JobRow(jobId: s.jobId, status: s.status, proteinPdbId: s.proteinPdbId, ligandName: s.ligandName,
                                  createdAt: s.createdAt, bestAffinity: s.bestAffinity, numPoses: s.numPoses,
                                  visibility: s.visibility)
                }
            }
            for await row in group { if let row { rows.append(row) } }
        }
        let knownBatches = Set(bs.map(\.batchId))
        for id in app.localBatches.prefix(30) where !knownBatches.contains(id) {
            if let b: BatchDetail = try? await Backend.get("/api/batch/\(id)") {
                bs.append(BatchRow(batchId: b.batchId, name: b.name, proteinPdbId: b.proteinPdbId,
                                   createdAt: b.createdAt, nLigands: b.nLigands, visibility: nil))
            }
        }
        jobs = rows.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
        batches = bs.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }
}

/// Ranked screening results, polled while ligands are still docking.
struct BatchDetailView: View {
    let batchID: String

    @EnvironmentObject private var app: AppModel
    @State private var batch: BatchDetail?
    @State private var error: String?
    @State private var exporting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let b = batch {
                    HStack(alignment: .bottom) {
                        PageTitle(title: b.name ?? "Screen vs \(b.proteinPdbId)",
                                  subtitle: "\(b.ligands.count) ligands against \(b.proteinPdbId), ranked by Vina score")
                        Spacer()
                        Button {
                            Task { await exportCSV() }
                        } label: {
                            Label(exporting ? "Exporting..." : "Export CSV", systemImage: "arrow.down.doc")
                        }
                        .disabled(exporting)
                    }
                    Card {
                        HStack(spacing: 18) {
                            if !b.finished { ProgressView().controlSize(.small) }
                            ForEach(["completed", "docking", "preparing", "queued", "failed"], id: \.self) { k in
                                if let n = b.counts[k], n > 0 {
                                    Text("\(Format.statusLabel(k)) \(n)")
                                        .foregroundColor(k == "failed" ? .red : k == "completed" ? .primary : .secondary)
                                }
                            }
                        }
                    }
                    Card(title: "Ranking") {
                        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                            GridRow {
                                Text("#"); Text("Ligand"); Text("Affinity"); Text("LE"); Text("H-bonds"); Text("Key residues")
                            }
                            .font(.caption).foregroundColor(.secondary)
                            ForEach(b.ligands) { l in
                                GridRow {
                                    Text(l.rank.map { "\($0)" } ?? "").monospacedDigit()
                                    if l.status == "completed" {
                                        Button(l.ligandName) { app.resultsPath.append(.job(l.jobId)) }.buttonStyle(.link)
                                    } else {
                                        Text(l.ligandName)
                                    }
                                    if l.status == "completed" {
                                        Text(Format.kcal(l.bestAffinity)).monospacedDigit()
                                    } else {
                                        Text(Format.statusLabel(l.status)).foregroundColor(l.status == "failed" ? .red : .secondary)
                                            .help(l.errorMessage ?? "")
                                    }
                                    Text(l.ligandEfficiency.map { String(format: "%.2f", $0) } ?? "").monospacedDigit()
                                    Text(l.hbonds.map { "\($0)" } ?? "").monospacedDigit()
                                    Text((l.keyResidues ?? []).joined(separator: ", ")).font(.caption).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                } else if let error {
                    Text(error).foregroundColor(.red)
                } else {
                    ProgressView("Loading screen...")
                }
            }
            .frame(maxWidth: 1000, alignment: .leading)
            .padding(32)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .navigationTitle(batch?.name ?? "Screen")
        .task(id: batchID) { await poll() }
    }

    private func poll() async {
        while !Task.isCancelled {
            do {
                let b: BatchDetail = try await Backend.get("/api/batch/\(batchID)", timeout: 30)
                batch = b
                if b.finished { return }
            } catch {
                if batch == nil {
                    self.error = (error as? Backend.Failure)?.status == 404
                        ? "This screen doesn't exist any more, or it's private to another account."
                        : "Couldn't load this screen."
                }
            }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
        }
    }

    private func exportCSV() async {
        exporting = true
        defer { exporting = false }
        if let data = try? await Backend.raw("/api/batch/\(batchID)/csv") {
            FilePanels.save(data, name: "moldock_\(batchID).csv")
        } else {
            error = "Couldn't export the CSV."
        }
    }
}
