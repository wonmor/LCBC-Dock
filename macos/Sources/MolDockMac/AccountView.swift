import SwiftUI

/// Email sign-in (link + 6-digit code) and plan summary. Mirrors
/// mobile/app/account.tsx.
struct AccountView: View {
    @EnvironmentObject private var store: AccountStore
    var showPro: () -> Void

    private enum Step { case email, code }

    @State private var email = ""
    @State private var code = ""
    @State private var step = Step.email
    @State private var working = false
    @State private var error: String?

    static let webAccountURL = URL(string: "https://lcbc-client.apps.johnseong.com/account")!

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Account")
                    .font(.system(.largeTitle, design: .rounded).weight(.semibold))

                if !store.ready {
                    ProgressView()
                } else {
                    if let account = store.account, account.signedIn {
                        summary(account)
                    }
                    if store.account?.email == nil {
                        signInCard
                    }
                    if store.account?.signedIn == true {
                        Button("Sign out") { Task { await store.signOut() } }
                            .buttonStyle(.link)
                    }
                }
            }
            .frame(maxWidth: 520, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    private func summary(_ account: AccountSummary) -> some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Signed in as").font(.caption).foregroundColor(.secondary)
                Text(account.email ?? "This Mac (no email yet)")
                Divider().padding(.vertical, 4)
                Text("Plan").font(.caption).foregroundColor(.secondary)
                Text(account.tierLabel)
                if let usage = account.usage {
                    Text("\(usage.usedToday) of \(usage.jobsPerDay) dockings used today")
                        .font(.caption).foregroundColor(.secondary)
                }
                Group {
                    if account.isPaid {
                        Link("Manage subscription",
                             destination: account.sources.contains("app_store") ? ProView.manageURL : Self.webAccountURL)
                            .buttonStyle(.bordered)
                    } else {
                        Button("Upgrade to MolDock Pro", action: showPro)
                            .buttonStyle(.borderedProminent)
                    }
                }
                .padding(.top, 6)
            }
        }
    }

    private var signInCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                Text(store.account?.signedIn == true ? "Add your email" : "Sign in with email")
                    .font(.system(.title3, design: .rounded).weight(.medium))
                Text("Your MolDock account carries your plan to the web app and your other devices. No password: we email you a link and a 6-digit code.")
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                switch step {
                case .email:
                    TextField("Email", text: $email, prompt: Text(verbatim: "you@university.edu"))
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(sendCode)
                    Button(working ? "Sending..." : "Email me a code", action: sendCode)
                        .buttonStyle(.borderedProminent)
                        .disabled(working)
                case .code:
                    Text("Sent to \(email). Open the link in the email on this Mac, or enter the code.")
                        .font(.callout).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    TextField("123456", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.oneTimeCode)
                        .font(.system(.title3, design: .monospaced))
                        .frame(maxWidth: 160)
                        .onChange(of: code) { value in
                            let digits = String(value.filter(\.isNumber).prefix(6))
                            if digits != value { code = digits }
                        }
                        .onSubmit(submitCode)
                    HStack(spacing: 14) {
                        Button(working ? "Checking..." : "Sign in", action: submitCode)
                            .buttonStyle(.borderedProminent)
                            .disabled(working || code.count != 6)
                        Button("Use a different email") {
                            step = .email
                            code = ""
                            error = nil
                        }
                        .buttonStyle(.link)
                    }
                }
                if let error {
                    Text(error).foregroundColor(.red).font(.callout)
                }
            }
        }
    }

    private func sendCode() {
        let value = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard value.contains("@") else {
            error = "Enter your email address."
            return
        }
        working = true
        error = nil
        Task {
            defer { working = false }
            do {
                try await store.requestCode(email: value)
                email = value
                step = .code
            } catch {
                self.error = (error as? Backend.Failure)?.errorDescription ?? "Couldn't send the sign-in email. Try again."
            }
        }
    }

    private func submitCode() {
        guard code.count == 6, !working else { return }
        working = true
        error = nil
        Task {
            defer { working = false }
            do {
                try await store.verifyCode(email: email, code: code)
                code = ""
                step = .email
            } catch {
                self.error = (error as? Backend.Failure)?.detail ?? "That code didn't work. Request a new one."
            }
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.12), lineWidth: 1))
    }
}
