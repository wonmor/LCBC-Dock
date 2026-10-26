import Foundation

// Server shapes for docking, results and screening (api/index.py,
// api/routes.py). Decoded with convertFromSnakeCase; anything the server
// may leave out is optional.

struct ProteinHit: Decodable, Identifiable, Hashable {
    var pdbId: String
    var title: String?
    var organism: String?
    var method: String?
    var resolution: Double?
    var id: String { pdbId }
}

struct LigandHit: Decodable, Identifiable, Hashable {
    var cid: Int?
    var name: String
    var molecularFormula: String?
    var molecularWeight: FlexibleDouble?
    var canonicalSmiles: String?
    var id: String { "\(cid ?? 0)-\(name)" }
}

/// PubChem hands MolecularWeight back as a string ("180.16"); be lenient.
struct FlexibleDouble: Decodable, Hashable {
    var value: Double
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { value = d }
        else { value = Double(try c.decode(String.self)) ?? 0 }
    }
}

struct StructureInfo: Decodable {
    struct Chain: Decodable, Hashable { var chain: String; var residues: Int }
    struct Hetero: Decodable, Hashable {
        var resname: String
        var chain: String
        var resseq: String
        var nAtoms: Int
        var metal: Bool
        var label: String
        var spec: String { "\(resname):\(chain):\(resseq)" }
    }
    var chains: [Chain]
    var hetero: [Hetero]
}

struct Pocket: Decodable, Hashable {
    var rank: Int
    var center: [Double]
    var size: [Double]
    var volumeA3: Double?
    var buriedness: Double?
    var residues: [String]?
}

struct PocketList: Decodable { var pockets: [Pocket] }

struct JobStatus: Decodable {
    var jobId: String
    var status: String
    var proteinPdbId: String
    var ligandCid: Int?
    var ligandName: String
    var createdAt: String?
    var completedAt: String?
    var errorMessage: String?
    var bestAffinity: Double?
    var numPoses: Int?
    var statusMessage: String?
    var queuePosition: Int?
    var batchId: String?
    var visibility: String?

    var isFinished: Bool { status == "completed" || status == "failed" }
}

struct SubmitReply: Decodable {
    var jobId: String
    var deduplicated: Bool?
    var adjustments: [String]?
}

struct JobRow: Decodable, Identifiable, Hashable {
    var jobId: String
    var status: String
    var proteinPdbId: String
    var ligandName: String
    var createdAt: String?
    var bestAffinity: Double?
    var numPoses: Int?
    var visibility: String?
    var id: String { jobId }
}

struct BatchRow: Decodable, Identifiable, Hashable {
    var batchId: String
    var name: String?
    var proteinPdbId: String
    var createdAt: String?
    var nLigands: Int?
    var visibility: String?
    var id: String { batchId }
}

struct MyJobs: Decodable {
    var jobs: [JobRow]
    var batches: [BatchRow]
}

struct Pose: Decodable, Identifiable, Hashable {
    var model: Int
    var affinity: Double?
    var rmsdLb: Double?
    var rmsdUb: Double?
    var pdbqt: String?
    var id: Int { model }
}

struct Interactions: Decodable {
    struct Residue: Decodable, Hashable {
        var residue: String
        var hbond: Int?
        var hydrophobic: Int?
        var piStacking: Int?
        var saltBridge: Int?
        var metal: Int?
        var minDistance: Double?
    }
    var locked: Bool?
    var counts: [String: Int]?
    var residues: [Residue]?
    var error: String?
}

struct Analysis: Decodable {
    struct RMSD: Decodable {
        var reference: String?
        var values: [Double?]?
        var note: String?
    }
    var rmsd: RMSD?
    var poses: [Interactions?]?
    var heavyAtoms: Int?
    var ligandEfficiency: Double?
    var lockedReason: String?
}

struct DockResult: Decodable {
    var jobId: String
    var proteinPdbId: String
    var ligandCid: Int?
    var ligandName: String
    var bestAffinity: Double?
    var numPoses: Int?
    var poses: [Pose]
    var dockedPdb: String?
    var exhaustiveness: Int?
    var numModes: Int?
    var seed: Int?
    var visibility: String?
    var ligandSmiles: String?
    var proteinSource: String?
    var analysis: Analysis?
    var methods: String?
    var hasReceptor: Bool?
    var sizeX: Double?
    var sizeY: Double?
    var sizeZ: Double?
}

struct BatchDetail: Decodable {
    struct Ligand: Decodable, Identifiable, Hashable {
        var jobId: String
        var ligandName: String
        var ligandSmiles: String?
        var status: String
        var bestAffinity: Double?
        var ligandEfficiency: Double?
        var hbonds: Int?
        var keyResidues: [String]?
        var errorMessage: String?
        var rank: Int?
        var id: String { jobId }
    }
    var batchId: String
    var name: String?
    var proteinPdbId: String
    var createdAt: String?
    var nLigands: Int?
    var counts: [String: Int]
    var ligands: [Ligand]

    var finished: Bool { (counts["completed"] ?? 0) + (counts["failed"] ?? 0) >= ligands.count && !ligands.isEmpty }
}

struct BatchReply: Decodable {
    struct Skipped: Decodable, Hashable { var name: String; var error: String }
    var batchId: String
    var nLigands: Int
    var skipped: [Skipped]?
    var truncated: Bool?
}

/// Binding-site + prep choices shared by Dock and Screen (web SiteSelector).
struct SiteChoice: Equatable {
    enum Mode: String, CaseIterable, Identifiable {
        case ligand, pocket, residues, auto
        var id: String { rawValue }
        var label: String {
            switch self {
            case .ligand: return "Co-crystal ligand"
            case .pocket: return "Pocket"
            case .residues: return "Residues"
            case .auto: return "Whole protein"
            }
        }
    }
    var mode: Mode = .auto
    var ligand = ""
    var residues = ""
    var pocketRank = 1
    var chains: Set<String> = []        // empty = all chains
    var keepHetero: Set<String> = []
    var ph = 7.4

    var siteJSON: [String: Any]? {
        switch mode {
        case .auto: return nil
        case .ligand: return ["mode": "ligand", "ligand": ligand]
        case .residues: return ["mode": "residues", "residues": residues]
        case .pocket: return ["mode": "pocket", "pocket_rank": pocketRank]
        }
    }

    var prepJSON: [String: Any] {
        ["chains": chains.sorted(), "keep_hetero": keepHetero.sorted(), "ph": ph]
    }

    var isComplete: Bool {
        switch mode {
        case .ligand: return !ligand.isEmpty
        case .residues: return !residues.trimmingCharacters(in: .whitespaces).isEmpty
        default: return true
        }
    }
}

enum Format {
    static func kcal(_ v: Double?) -> String {
        guard let v else { return "–" }
        return String(format: "%.1f", v)
    }
    static func date(_ iso: String?) -> String {
        guard let iso, iso.count >= 16 else { return iso ?? "" }
        let s = String(iso.prefix(16)).replacingOccurrences(of: "T", with: " ")
        return s
    }
    static func statusLabel(_ s: String) -> String {
        switch s {
        case "queued": return "Queued"
        case "preparing": return "Preparing"
        case "docking": return "Docking"
        case "completed": return "Completed"
        case "failed": return "Failed"
        default: return s.capitalized
        }
    }
}
