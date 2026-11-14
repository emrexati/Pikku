import SwiftUI

@main
@MainActor
struct SohbetApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var theme = ThemeStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(model.call)
                .environmentObject(theme)
        }
    }
}

@MainActor
struct RootView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var call: CallManager
    @EnvironmentObject var theme: ThemeStore
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ZStack {
            Group {
                if model.config == nil {
                    SetupView()
                } else {
                    NavigationStack { ChatView() }
                }
            }
            if model.locked {
                LockView().transition(.opacity)
            } else if phase != .active && model.config != nil {
                PrivacyCover()
            }
        }
        .tint(theme.accent)
        .preferredColorScheme(theme.scheme)
        .fullScreenCover(isPresented: Binding(get: { call.state != .idle }, set: { _ in })) {
            CallView()
                .environmentObject(model)
                .environmentObject(call)
                .environmentObject(theme)
        }
        .onChange(of: phase) { p in
            if p == .active {
                model.setActive(true)
                if model.locked { Task { await model.unlock() } }
            } else if p == .background {
                model.setActive(false)
            }
        }
        .task {
            if model.locked { await model.unlock() }
        }
    }
}

/// Uygulama değiştiricide sohbet içeriğinin görünmemesi için.
@MainActor
struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThickMaterial).ignoresSafeArea()
            Image(systemName: "lock.fill").font(.system(size: 44)).foregroundColor(.secondary)
        }
    }
}

@MainActor
struct LockView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var theme: ThemeStore

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 90, height: 90)
                    .background(Circle().fill(theme.accent))
                Text("Pikku kilitli").font(.title2.bold())
                Text("Devam etmek için Face ID veya cihaz şifreni kullan.")
                    .font(.callout)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    Task { await model.unlock() }
                } label: {
                    Text("Kilidi aç")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: 240)
                        .frame(height: 50)
                        .background(RoundedRectangle(cornerRadius: 14).fill(theme.accent))
                }
                .padding(.top, 8)
            }
            .padding(32)
        }
    }
}
