import SwiftUI

/// Curated examples from the web (app/examples/page.tsx). "Dock now" submits
/// straight away with the same defaults as the web Dock page; "Customize"
/// opens Dock prefilled.
struct ExamplesView: View {
    struct Example: Identifiable, Hashable {
        var protein: String
        var proteinName: String
        var ligandCid: Int
        var ligandName: String
        var category: String
        var description: String
        var id: String { "\(protein)-\(ligandCid)" }
    }

    static let all: [Example] = [
        Example(protein: "1IEP", proteinName: "BCR-ABL Kinase", ligandCid: 5291, ligandName: "Imatinib", category: "Cancer",
                description: "Revolutionary cancer drug for chronic myeloid leukemia. First targeted tyrosine kinase inhibitor."),
        Example(protein: "4HG7", proteinName: "MDM2", ligandCid: 11433190, ligandName: "Nutlin-3a", category: "Cancer",
                description: "Inhibits p53-MDM2 interaction, reactivating tumor suppressor p53 in cancer cells."),
        Example(protein: "5IKR", proteinName: "COX-2", ligandCid: 2244, ligandName: "Aspirin", category: "Pain & Inflammation",
                description: "The world's most widely used drug. Inhibits cyclooxygenase to reduce pain and inflammation."),
        Example(protein: "3RFM", proteinName: "Adenosine A2A Receptor", ligandCid: 2519, ligandName: "Caffeine", category: "Neuroscience",
                description: "Blocks adenosine receptors in the brain, preventing drowsiness and promoting alertness."),
        Example(protein: "1UDT", proteinName: "PDE5", ligandCid: 5212, ligandName: "Sildenafil", category: "Cardiovascular",
                description: "Inhibits phosphodiesterase type 5. Originally developed for hypertension, famously repurposed."),
        Example(protein: "2HT8", proteinName: "Neuraminidase", ligandCid: 65028, ligandName: "Oseltamivir", category: "Antiviral",
                description: "Tamiflu, the frontline antiviral for influenza. Blocks viral release from host cells."),
        Example(protein: "7BV2", proteinName: "RNA-dependent RNA Polymerase", ligandCid: 121304016, ligandName: "Remdesivir", category: "Antiviral",
                description: "Developed for COVID-19. Mimics adenosine and terminates viral RNA replication."),
        Example(protein: "1MUI", proteinName: "HIV-1 Protease", ligandCid: 92727, ligandName: "Lopinavir", category: "Antiviral",
                description: "HIV protease inhibitor used in combination antiretroviral therapy for AIDS treatment."),
        Example(protein: "1JFF", proteinName: "Tubulin", ligandCid: 36314, ligandName: "Paclitaxel", category: "Cancer",
                description: "Taxol, derived from Pacific yew tree bark. Stabilizes microtubules to halt cancer cell division."),
        Example(protein: "4CFF", proteinName: "AMPK", ligandCid: 4091, ligandName: "Metformin", category: "Metabolic",
                description: "The most prescribed diabetes drug globally. Activates AMP-activated protein kinase."),
        Example(protein: "3ERT", proteinName: "Estrogen Receptor α", ligandCid: 2733526, ligandName: "Tamoxifen", category: "Cancer",
                description: "Selective estrogen receptor modulator for breast cancer. Blocks estrogen-driven tumor growth."),
        Example(protein: "2RG6", proteinName: "Acetylcholinesterase", ligandCid: 3152, ligandName: "Donepezil", category: "Neuroscience",
                description: "Aricept, first-line treatment for Alzheimer's disease. Inhibits acetylcholine breakdown."),
        Example(protein: "3NYA", proteinName: "EGFR Kinase", ligandCid: 176870, ligandName: "Erlotinib", category: "Cancer",
                description: "Targets epidermal growth factor receptor in non-small cell lung cancer."),
        Example(protein: "3OGP", proteinName: "HMG-CoA Reductase", ligandCid: 60823, ligandName: "Atorvastatin", category: "Cardiovascular",
                description: "Lipitor, the best-selling drug in history. Lowers cholesterol by inhibiting its synthesis."),
        Example(protein: "2ITO", proteinName: "Dihydrofolate Reductase", ligandCid: 126941, ligandName: "Methotrexate", category: "Cancer",
                description: "Antimetabolite chemotherapy drug. Blocks folate metabolism essential for DNA synthesis."),
        Example(protein: "1PWC", proteinName: "Penicillin-Binding Protein", ligandCid: 5904, ligandName: "Penicillin G", category: "Antibiotic",
                description: "The drug that started the antibiotic revolution. Disrupts bacterial cell wall synthesis."),
    ]

    static let categories: [String] = {
        var seen: [String] = ["All"]
        for e in all where !seen.contains(e.category) { seen.append(e.category) }
        return seen
    }()

    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var store: AccountStore
    @State private var search = ""
    @State private var category = "All"
    @State private var docking: String?
    @State private var error: ShownError?

    private var filtered: [Example] {
        let q = search.lowercased()
        return Self.all.filter { e in
            (category == "All" || e.category == category) &&
            (q.isEmpty || [e.ligandName, e.proteinName, e.protein, e.category, e.description]
                .contains { $0.lowercased().contains(q) })
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageTitle(title: "Examples", subtitle: "Famous protein–ligand dockings. Dock one with a click, or open it in Dock to change the settings.")

                HStack(spacing: 12) {
                    TextField("Search examples (cancer, aspirin, kinase...)", text: $search)
                        .textFieldStyle(.roundedBorder)
                    Picker("Category", selection: $category) {
                        ForEach(Self.categories, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                    .frame(width: 200)
                }

                if let error { ErrorLine(error: error) }

                LazyVStack(spacing: 12) {
                    ForEach(filtered) { ex in row(ex) }
                }
                if filtered.isEmpty {
                    Text("No examples match.").foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        #if DEBUG
        .task {
            // QA hook: -MolDockDockExample <protein> presses "Dock now".
            if let p = UserDefaults.standard.string(forKey: "MolDockDockExample"),
               let ex = Self.all.first(where: { $0.protein == p }) {
                await dockNow(ex)
            }
        }
        #endif
    }

    private func row(_ ex: Example) -> some View {
        Card {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(ex.ligandName).font(.system(.title3, design: .rounded).weight(.medium))
                        Text("+ \(ex.proteinName)").foregroundColor(.secondary)
                    }
                    Text(ex.description)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("PDB \(ex.protein) | PubChem CID \(String(ex.ligandCid)) | \(ex.category)")
                        .font(.caption.monospaced())
                        .foregroundColor(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 8) {
                    Button {
                        Task { await dockNow(ex) }
                    } label: {
                        Text(docking == ex.id ? "Submitting..." : "Dock now").frame(minWidth: 96)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(docking != nil)
                    Button("Customize") {
                        app.dock(DockDraft(protein: ex.protein, ligandCid: ex.ligandCid, ligandName: ex.ligandName))
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private func dockNow(_ ex: Example) async {
        docking = ex.id
        error = nil
        defer { docking = nil }
        do {
            let id = try await DockingService.submitExample(protein: ex.protein, cid: ex.ligandCid, name: ex.ligandName)
            app.openJob(id)
            await store.refresh()
        } catch {
            self.error = ShownError(error, fallback: "Couldn't start the docking. Try again.")
        }
    }
}

/// Job submission shared by Dock and Examples (POST /api/dock).
enum DockingService {
    struct Ligand {
        var cid = 0
        var name = "ligand"
        var smiles: String?
        var sdf: String?
    }

    static func submit(protein: String, ligand: Ligand, site: SiteChoice, exhaustiveness: Int,
                       numModes: Int, seed: Int?, isPrivate: Bool, redock: Bool) async throws -> SubmitReply {
        var body: [String: Any] = [
            "protein_pdb_id": protein,
            "ligand_cid": ligand.cid,
            "ligand_name": ligand.name,
            "center_x": 0, "center_y": 0, "center_z": 0,
            "size_x": 20, "size_y": 20, "size_z": 20,
            "exhaustiveness": exhaustiveness,
            "num_modes": numModes,
            "energy_range": 3.0,
            "prep": site.prepJSON,
            "private": isPrivate,
            // Over-limit parameters → 402 with the upgrade message instead
            // of being silently clamped (same as the web Dock page).
            "strict": true,
        ]
        if let smiles = ligand.smiles { body["ligand_smiles"] = smiles }
        if let sdf = ligand.sdf { body["ligand_sdf"] = sdf }
        if let s = site.siteJSON { body["site"] = s }
        if site.mode == .ligand && redock { body["reference_ligand"] = site.ligand }
        if let seed { body["seed"] = seed }
        return try await Backend.post("/api/dock", body, timeout: 60)
    }

    /// Example defaults: the first co-crystallised ligand as the site (with
    /// the redocking check), otherwise the whole protein.
    static func submitExample(protein: String, cid: Int, name: String) async throws -> String {
        var site = SiteChoice()
        if let info: StructureInfo = try? await Backend.get("/api/structure/\(protein)/inspect", timeout: 45),
           let lig = info.hetero.first(where: { !$0.metal }) {
            site.mode = .ligand
            site.ligand = lig.spec
        }
        let reply = try await submit(protein: protein, ligand: Ligand(cid: cid, name: name), site: site,
                                     exhaustiveness: 8, numModes: 9, seed: nil, isPrivate: false, redock: true)
        return reply.jobId
    }
}
