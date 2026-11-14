import SwiftUI
import UIKit

@MainActor
struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var theme: ThemeStore
    @Environment(\.dismiss) private var dismiss
    @State private var c: Config
    @State private var showCode = false
    @State private var confirmReset = false
    @State private var confirmClearAll = false
    @State private var confirmClearMe = false

    init(config: Config) {
        _c = State(initialValue: config)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Profil") {
                    TextField("Adın", text: $c.myName)
                }
                privacySection
                appearanceSection
                colorSection
                codeSection
                connectionSection
                chatSection
            }
            .navigationTitle("Ayarlar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Bitti") { saveAndClose() }
                }
            }
            .confirmationDialog("Tüm mesajlar iki cihazdan da silinsin mi?", isPresented: $confirmClearAll, titleVisibility: .visible) {
                Button("İki taraftan da sil", role: .destructive) { model.clearForAll() }
            }
            .confirmationDialog("Tüm mesajlar yalnızca bu cihazdan silinsin mi?", isPresented: $confirmClearMe, titleVisibility: .visible) {
                Button("Benden sil", role: .destructive) { model.clearForMe() }
            }
            .confirmationDialog("Eşleşme, anahtar ve tüm mesajlar bu cihazdan silinsin mi?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Sıfırla", role: .destructive) {
                    dismiss()
                    model.resetPairing()
                }
            }
        }
    }

    // MARK: - Bölümler

    private var privacySection: some View {
        Section {
            Toggle("Çevrimiçi ve son görülme", isOn: $c.showPresence)
            Toggle("Okundu bilgisi gönder", isOn: $c.readReceipts)
            Toggle("Face ID / şifre ile kilitle", isOn: $c.appLock)
                .disabled(!AppModel.canUseLock && !c.appLock)
            Picker("Otomatik silme", selection: Binding(get: { model.ttl }, set: { model.setTTL($0) })) {
                ForEach(AppModel.ttlOptions.indices, id: \.self) { i in
                    Text(AppModel.ttlOptions[i].1).tag(AppModel.ttlOptions[i].0)
                }
            }
        } header: {
            Text("Gizlilik ve güvenlik")
        } footer: {
            Text("Çevrimiçi bilgini kapatırsan karşı tarafınkini de göremezsin. Otomatik silme iki cihazda da geçerli olur ve sonraki mesajlara uygulanır. Ekran görüntüsü alındığında karşı tarafa bildirilir. Sohbet geçmişi bu cihazda şifreli tutulur ve iCloud yedeğine girmez.")
        }
    }

    private var appearanceSection: some View {
        Section("Görünüm") {
            Picker("Tema", selection: $theme.theme.mode) {
                Text("Sistem").tag(0)
                Text("Açık").tag(1)
                Text("Koyu").tag(2)
            }
            .pickerStyle(.segmented)

            VStack(alignment: .leading, spacing: 10) {
                Text("Vurgu rengi")
                HStack(spacing: 12) {
                    ForEach(Wallpapers.accents, id: \.self) { hex in
                        Circle()
                            .fill(Color(UIColor(hex: hex)))
                            .frame(width: 30, height: 30)
                            .overlay(Circle().stroke(Color.primary, lineWidth: theme.theme.accent == hex ? 2.5 : 0).padding(-4))
                            .onTapGesture { theme.theme.accent = hex }
                    }
                }
                .padding(.leading, 4)
            }
            .padding(.vertical, 4)

            VStack(alignment: .leading, spacing: 10) {
                Text("Arka plan")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(Wallpapers.all.enumerated()), id: \.offset) { i, w in
                            VStack(spacing: 4) {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(LinearGradient(colors: [.dyn(w.light.0, w.dark.0), .dyn(w.light.1, w.dark.1)],
                                                         startPoint: .top, endPoint: .bottom))
                                    .frame(width: 54, height: 80)
                                    .overlay(RoundedRectangle(cornerRadius: 10)
                                        .stroke(theme.accent, lineWidth: theme.theme.wallpaper == i ? 3 : 0))
                                Text(w.name).font(.caption2)
                            }
                            .onTapGesture { theme.theme.wallpaper = i }
                        }
                    }
                    .padding(4)
                }
            }
            .padding(.vertical, 4)

            VStack(alignment: .leading) {
                HStack {
                    Text("Yazı boyutu")
                    Spacer()
                    Text("\(Int(theme.theme.fontSize))").foregroundColor(.secondary)
                }
                Slider(value: $theme.theme.fontSize, in: 13...24, step: 1)
            }
        }
    }

    private var colorSection: some View {
        Section {
            ColorPicker("Benim balonum", selection: colorBinding(\.myBubble, fallback: theme.myBubble), supportsOpacity: false)
            ColorPicker("Benim yazı rengim", selection: colorBinding(\.myText, fallback: theme.myText), supportsOpacity: false)
            ColorPicker("Karşı tarafın balonu", selection: colorBinding(\.theirBubble, fallback: theme.theirBubble), supportsOpacity: false)
            ColorPicker("Karşı tarafın yazı rengi", selection: colorBinding(\.theirText, fallback: theme.theirText), supportsOpacity: false)
            preview
            Button("Varsayılan renklere dön") { theme.resetColors() }
        } header: {
            Text("Mesaj renkleri")
        }
    }

    private var preview: some View {
        VStack(spacing: 6) {
            HStack {
                Text("Merhaba, nasılsın?")
                    .font(theme.font)
                    .foregroundColor(theme.theirText)
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 17).fill(theme.theirBubble))
                Spacer()
            }
            HStack {
                Spacer()
                Text("İyiyim, sen?")
                    .font(theme.font)
                    .foregroundColor(theme.myText)
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 17).fill(theme.myBubble))
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.wallpaper))
        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
    }

    private var codeSection: some View {
        Section {
            HStack {
                Text(showCode ? c.code : "••••-••••-••••-••••")
                    .font(.system(.body, design: .monospaced))
                Spacer()
                Button(showCode ? "Gizle" : "Göster") { showCode.toggle() }
                    .buttonStyle(.borderless)
                Button("Kopyala") { SecureFiles.copySecret(c.code) }
                    .buttonStyle(.borderless)
            }
        } header: {
            Text("Eşleşme kodu")
        } footer: {
            Text("Kodu bilen herkes sohbete katılabilir. Kopyalanan kod 2 dakika sonra panodan silinir.")
        }
    }

    private var connectionSection: some View {
        Section {
            TextField("https://ntfy.sh", text: $c.server)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("TURN: turn:sunucu.com:3478", text: $c.turnURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("TURN kullanıcı adı", text: $c.turnUser)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            SecureField("TURN şifresi", text: $c.turnPass)
        } header: {
            Text("Bağlantı")
        } footer: {
            Text("Aktarma sunucusu iki tarafta da aynı olmalı. Sunucu yalnızca şifreli veri görür. Mobil veride görüşme bağlanmazsa bir TURN sunucusu ekle.")
        }
    }

    private var chatSection: some View {
        Section("Sohbet") {
            Button("Sohbeti iki taraftan da sil", role: .destructive) { confirmClearAll = true }
            Button("Sohbeti yalnızca benden sil", role: .destructive) { confirmClearMe = true }
            Button("Eşleşmeyi sıfırla", role: .destructive) { confirmReset = true }
        }
    }

    // MARK: - Yardımcılar

    private func colorBinding(_ key: WritableKeyPath<Theme, UInt32?>, fallback: Color) -> Binding<Color> {
        Binding(
            get: { theme.theme[keyPath: key].map { Color(UIColor(hex: $0)) } ?? fallback },
            set: { theme.theme[keyPath: key] = $0.hex }
        )
    }

    private func saveAndClose() {
        var n = c
        n.myName = n.myName.trimmed
        n.server = n.server.trimmed
        if n.myName.isEmpty { n.myName = model.config?.myName ?? "Ben" }
        if n.server.isEmpty || URL(string: n.server) == nil { n.server = "https://ntfy.sh" }
        if n.appLock && !AppModel.canUseLock { n.appLock = false }
        model.update(n)
        dismiss()
    }
}
