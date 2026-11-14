import SwiftUI
import UIKit

@MainActor
struct SetupView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var theme: ThemeStore
    @State private var name = ""
    @State private var code = ""
    @State private var copied = false

    private var codeOK: Bool { KeyDerivation.normalize(code).count >= 12 }
    private var canStart: Bool { !name.trimmed.isEmpty && codeOK && !model.preparing }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 54, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 112, height: 112)
                    .background(Circle().fill(theme.accent))
                    .padding(.top, 48)

                VStack(spacing: 6) {
                    Text("Pikku").font(.largeTitle.bold())
                    Text("Yalnızca ikiniz için. Mesajlar, dosyalar ve aramalar uçtan uca şifreli.")
                        .font(.callout)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("ADIN").font(.caption).foregroundColor(.secondary)
                    TextField("Örn. Emre", text: $name)
                        .textInputAutocapitalization(.words)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))

                    Text("EŞLEŞME KODU").font(.caption).foregroundColor(.secondary).padding(.top, 8)
                    TextField("XXXX-XXXX-XXXX-XXXX", text: $code)
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .textContentType(.oneTimeCode)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))

                    HStack {
                        Button {
                            code = Self.randomCode()
                            copied = false
                        } label: {
                            Label("Yeni kod üret", systemImage: "wand.and.stars")
                        }
                        Spacer()
                        Button {
                            SecureFiles.copySecret(code)
                            copied = true
                        } label: {
                            Label(copied ? "Kopyalandı" : "Kopyala", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                        .disabled(code.isEmpty)
                    }
                    .font(.subheadline)
                    .padding(.top, 2)

                    if !code.isEmpty && !codeOK {
                        Text("Kod en az 12 harf/rakam olmalı.").font(.footnote).foregroundColor(.red)
                    }

                    Text("Biriniz kod üretip diğerine yüz yüze ya da güvendiğin bir kanaldan iletsin, ikiniz de aynı kodu girin. Kopyalanan kod 2 dakika sonra panodan silinir.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.top, 6)
                }

                Button {
                    model.setup(name: name, code: code)
                } label: {
                    HStack(spacing: 10) {
                        if model.preparing { ProgressView().tint(.white) }
                        Text(model.preparing ? "Anahtar oluşturuluyor…" : "Başla")
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(RoundedRectangle(cornerRadius: 14).fill(canStart || model.preparing ? theme.accent : Color.gray.opacity(0.4)))
                }
                .disabled(!canStart)
                .padding(.top, 6)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    static func randomCode() -> String {
        let chars = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return (0..<4).map { _ in
            String((0..<4).map { _ in chars.randomElement()! })
        }.joined(separator: "-")
    }
}
