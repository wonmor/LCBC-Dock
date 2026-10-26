import SwiftUI

/// Batch virtual screening (app/screen/page.tsx): one target, a SMILES or
/// SDF library, ranked results. The ligand cap per batch is the plan's
/// max_batch_ligands (signed-out: sign in first; Free: 5; Pro: 500).
struct ScreenView: View {
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var store: AccountStore

    static let example = """
    smiles name
    CC(C)(C)NC(=O)[C@@H]1CN(Cc2cccnc2)CCN1C[C@@H](O)C[C@@H](Cc1ccccc1)C(=O)N[C@@H]1c2ccccc2C[C@@H]1O Indinavir
    CC(C)CN(C[C@@H](O)[C@H](Cc1ccccc1)NC(=O)O[C@H]1CCOC1)S(=O)(=O)c1ccc(N)cc1 Amprenavir
    CC(=O)Oc1ccccc1C(=O)O Aspirin
    Cn1cnc2c1c(=O)n(C)c(=O)n2C Caffeine
    """

    @State private var proteinField = "1HSG"
    @State private var protein = "1HSG"
    @State private var site = SiteChoice()
    @State private var library = ""
    @State private var name = ""
    @State private var exhaustiveness = 8.0
    @State private var isPrivate = false
    @State private var submitting = false
    @State private var error: ShownError?

    private var limits: PlanLimits? { store.account?.limits }
    private var cap: Int { limits?.maxBatchLigands ?? 0 }

    private var ligandCount: Int {
        if library.contains("$$$$") { return library.components(separatedBy: "$$$$").count - 1 }
        return library.split(separator: "\n").filter {
            let t = $0.trimmingCharacters(in: .whitespaces)
            return !t.isEmpty && !t.lowercased().hasPrefix("smiles")
        }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageTitle(title: "Screen", subtitle: "Dock a ligand library against one target, ranked by Vina score and ligand efficiency.")
                planNote
                Card(title: "Target") {
                    HStack {
                        TextField("PDB ID or UniProt accession (AlphaFold)", text: $proteinField)
                            .textFieldStyle(.roundedBorder)
                            .font(.body.monospaced())
                            .onSubmit(commitProtein)
                        Button("Use", action: commitProtein)
                    }
                }
                Card(title: "Binding site") {
                    SiteSelectorView(protein: protein, site: $site)
                }
                Card(title: "Library") {
                    TextEditor(text: $library)
                        .font(.body.monospaced())
                        .frame(minHeight: 160)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.primary.opacity(0.15)))
                    HStack {
                        Button("Open File...", action: openLibrary)
                        Button("Load Example") { library = Self.example; if name.isEmpty { name = "HIV protease inhibitors" } }
                        Spacer()
                        Text("\(ligandCount) ligand\(ligandCount == 1 ? "" : "s")\(cap > 0 ? " of \(cap) on your plan" : "")")
                            .foregroundColor(ligandCount > cap && cap > 0 ? .orange : .secondary)
                            .monospacedDigit()
                    }
                    Text("One SMILES per line, optionally followed by a name, or a multi-record SDF file.")
                        .font(.caption).foregroundColor(.secondary)
                    TextField("Screen name (optional)", text: $name).textFieldStyle(.roundedBorder)
                }
                Card(title: "Parameters") {
                    HStack {
                        Text("Exhaustiveness")
                        Slider(value: $exhaustiveness, in: 1...32, step: 1)
                        Text("\(Int(exhaustiveness))").monospacedDigit().frame(width: 28)
                    }
                    if Int(exhaustiveness) > (limits?.maxExhaustiveness ?? 32) {
                        Text("Above \(limits?.maxExhaustiveness ?? 8) needs MolDock Pro.").font(.caption).foregroundColor(.orange)
                    }
                    Toggle("Private screen (only you can open the results)", isOn: $isPrivate).toggleStyle(.checkbox)
                    if isPrivate && limits?.privateJobs != true {
                        Text("Private screens need MolDock Pro.").font(.caption).foregroundColor(.orange)
                    }
                }
                if let error { ErrorLine(error: error) }
                Button {
                    Task { await submit() }
                } label: {
                    Text(submitting ? "Submitting..." : "Start screen").frame(minWidth: 160)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(submitting || protein.isEmpty || ligandCount == 0 || !site.isComplete || store.account?.signedIn != true)
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    @ViewBuilder
    private var planNote: some View {
        if store.account?.email == nil {
            Card {
                Text("Sign in (free) to screen up to 5 ligands, or go Pro for 500 per batch.")
                HStack {
                    Button("Sign In") { app.section = .account }.buttonStyle(.borderedProminent)
                    Button("See MolDock Pro") { app.section = .pro }.buttonStyle(.bordered)
                }
            }
        } else if store.account?.isPaid != true {
            HStack {
                Text("Free plan: up to \(cap) ligands per screen. MolDock Pro screens up to 500.")
                    .foregroundColor(.secondary)
                Button("See Pro") { app.section = .pro }.buttonStyle(.link)
            }
        }
    }

    private func commitProtein() {
        let p = proteinField.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard p != protein else { return }
        protein = p
        site = SiteChoice()
    }

    private func openLibrary() {
        guard let url = FilePanels.open(types: ["sdf", "smi", "csv", "txt"]),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        library = text
        if name.isEmpty { name = url.deletingPathExtension().lastPathComponent }
    }

    private func submit() async {
        submitting = true
        error = nil
        defer { submitting = false }
        var body: [String: Any] = [
            "protein_pdb_id": protein,
            "library": library,
            "prep": site.prepJSON,
            "exhaustiveness": Int(exhaustiveness),
            "private": isPrivate,
            "strict": true,
        ]
        if !name.isEmpty { body["name"] = name }
        if let s = site.siteJSON { body["site"] = s }
        do {
            let reply: BatchReply = try await Backend.post("/api/batch", body, timeout: 120)
            await store.refresh()
            app.openBatch(reply.batchId)
        } catch {
            self.error = ShownError(error, fallback: "Couldn't start the screen.")
        }
    }
}

struct AboutView: View {
    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
        return "Version \(v) (\(b))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageTitle(title: "MolDock", subtitle: version)
                Card(title: "What it does") {
                    Text("MolDock runs protein–ligand docking with AutoDock Vina on our servers: structures come from the RCSB PDB and AlphaFold, molecules from PubChem or your own SMILES and SDF files. Results include every pose with its score, redocking RMSD against the crystal ligand, geometric interaction analysis and exports for PyMOL, ChimeraX and spreadsheets.")
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Your account and plan are shared with the MolDock web app and the iPhone app.")
                        .foregroundColor(.secondary)
                }
                Card(title: "Credits") {
                    Text("AutoDock Vina (Eberhardt et al., J. Chem. Inf. Model. 2021; Trott and Olson, J. Comput. Chem. 2010). RDKit and Open Babel for preparation. Structures from the RCSB Protein Data Bank and the AlphaFold Protein Structure Database; compounds from PubChem.")
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Made by John Seong.").foregroundColor(.secondary)
                }
                HStack(spacing: 14) {
                    Link("Web app", destination: URL(string: "https://lcbc-client.apps.johnseong.com")!)
                    Text("|").foregroundColor(.secondary)
                    Link("Privacy Policy", destination: ProView.privacyURL)
                    Text("|").foregroundColor(.secondary)
                    Link("Terms of Use (EULA)", destination: ProView.eulaURL)
                }
            }
            .frame(maxWidth: 680, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }
}
