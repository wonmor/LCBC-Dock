import Foundation
import Security

/// MolDock server client. Every call carries the signed-in session so the
/// server applies the account's plan (limits are enforced server-side,
/// never in the app). Mirrors mobile/lib/api.ts + mobile/lib/account.ts.
enum Backend {
    static let base = URL(string: "https://lcbc-server.apps.johnseong.com")!

    struct Failure: LocalizedError {
        let status: Int          // 0 = never reached the server
        let detail: String?

        var isRejection: Bool { status >= 400 && status < 500 }
        var errorDescription: String? {
            if let detail, !detail.isEmpty { return detail }
            return status == 0 ? "Can't reach MolDock. Check your connection." : "MolDock returned an error (\(status))."
        }
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    static func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send("GET", path, body: nil)
    }

    static func post<T: Decodable>(_ path: String, _ body: [String: String] = [:], as type: T.Type = T.self) async throws -> T {
        try await send("POST", path, body: body)
    }

    private static func send<T: Decodable>(_ method: String, _ path: String, body: [String: String]?) async throws -> T {
        var req = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: 20)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = Session.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw Failure(status: 0, detail: nil)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw Failure(status: status, detail: json?["detail"] as? String)
        }
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Server shapes (api/accounts.py account_summary, api/plans.py)

struct PlanLimits: Decodable {
    var jobsPerDay: Int?
    var maxExhaustiveness: Int?
    var maxNumModes: Int?
    var maxBoxEdge: Double?
    var maxBatchLigands: Int?

    static let proFallback = PlanLimits(jobsPerDay: 300, maxExhaustiveness: 32, maxNumModes: 20,
                                        maxBoxEdge: 40, maxBatchLigands: 500)
}

struct AccountSummary: Decodable {
    struct Usage: Decodable {
        var usedToday: Int
        var jobsPerDay: Int
    }
    struct AppStore: Decodable {
        var productId: String?
        var expiresAt: String?
    }

    var signedIn: Bool
    var email: String?
    var tier: String
    var sources: [String]
    var usage: Usage?
    var appStore: AppStore?
    var appAccountToken: String?

    var isPaid: Bool { tier == "pro" || tier == "lab" }

    var tierLabel: String {
        switch tier {
        case "anonymous": return "Not signed in"
        case "free": return "Free"
        case "pro": return "Pro"
        case "lab": return "Lab / Institution"
        default: return tier
        }
    }
}

struct Pricing: Decodable {
    struct Tier: Decodable { var limits: PlanLimits? }
    var tiers: [String: Tier]
}

struct SessionReply: Decodable {
    var sessionToken: String
}

struct PurchaseReply: Decodable {
    var tier: String?
    var sessionToken: String?
}

struct OK: Decodable {}

// MARK: - Session token (mds_...) in the Keychain

enum Session {
    private static let service = "moldock.session"
    private static var cached: String?
    private static var loaded = false

    static var token: String? {
        if !loaded {
            loaded = true
            cached = read()
        }
        return cached
    }

    static func save(_ token: String?) {
        cached = token
        loaded = true
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service]
        SecItemDelete(query as CFDictionary)
        guard let token, let data = token.data(using: .utf8) else { return }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func read() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
