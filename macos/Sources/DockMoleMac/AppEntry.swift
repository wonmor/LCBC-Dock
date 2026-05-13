import SwiftUI
import AppKit

@main
struct DockMoleMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        WindowGroup("DockMole", id: "main") {
            ContentView()
                .frame(minWidth: 980, minHeight: 640)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.titleBar)
        .commands {
            // Replace New (we're not a document app) — keeps the File
            // menu uncluttered.
            CommandGroup(replacing: .newItem) { }
            // Apple guideline 4: closing the only window must leave a
            // way back. ⌘0 + Window-menu entry reopens the main window.
            CommandGroup(after: .windowList) {
                Button("DockMole") {
                    if let win = NSApp.windows.first(where: { $0.canBecomeKey }) {
                        win.makeKeyAndOrderFront(nil)
                    } else {
                        openWindow(id: "main")
                    }
                }
                .keyboardShortcut("0", modifiers: .command)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Keep the app alive when the user closes the last window so the
    /// dock-icon click can bring it back. Pairs with the Window-menu
    /// command above for the guideline 4 fix.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows {
            for window in sender.windows where window.canBecomeKey {
                window.makeKeyAndOrderFront(nil)
                return true
            }
        }
        return true
    }
}
