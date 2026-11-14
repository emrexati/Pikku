import Foundation
import SwiftUI
import UIKit

// MARK: - Ayarlar (Keychain'de saklanır)

struct Config: Codable, Equatable {
    var myName: String
    var code: String
    var server: String = "https://ntfy.sh"
    var deviceId: String = UUID().uuidString
    var turnURL: String = ""
    var turnUser: String = ""
    var turnPass: String = ""
    var showPresence: Bool = true
    var readReceipts: Bool = true
    var appLock: Bool = false
}

// MARK: - Sunucudan geçen (şifreli) paket

enum EnvelopeKind: String, Codable {
    case text, media, edit, delete, clear, ttl, read, presence, typing, screenshot
    case offer, answer, hangup, reject, busy
}

struct MediaInfo: Codable, Equatable {
    var url: String
    var kind: String          // "image" | "video"
    var size: Int
    var w: Double?
    var h: Double?
    var dur: Double?
    var thumb: String?        // çok küçük, bulanık önizleme (base64 jpeg)
    var isVideo: Bool { kind == "video" }
}

struct Envelope: Codable {
    var id: String
    var from: String
    var name: String
    var kind: EnvelopeKind
    var body: String
    var ts: Double
    var video: Bool? = nil
    var callId: String? = nil
    var target: String? = nil
    var replyTo: String? = nil
    var ttl: Double? = nil
    var media: MediaInfo? = nil
}

// MARK: - Ekranda görünen mesaj

enum MediaState: String, Codable { case uploading, downloading, ready, failed, expired }

struct ChatMessage: Codable, Identifiable, Equatable {
    enum Status: String, Codable { case sending, sent, read, failed, received }
    var id: String
    var text: String
    var mine: Bool
    var date: Date
    var status: Status
    var system: Bool? = nil
    var ts: Double? = nil
    var edited: Bool? = nil
    var replyTo: String? = nil
    var expiresAt: Date? = nil
    var media: MediaInfo? = nil
    var localFile: String? = nil
    var mediaState: MediaState? = nil

    var preview: String {
        if let m = media { return m.isVideo ? "Video" : "Fotoğraf" }
        return text
    }
}

// MARK: - Tema

enum WallpaperStyle { case gradient, storybook, eventHorizon, science, space }

/// Hazır tema: arka plan + renkleri birlikte uygular.
struct ThemePreset {
    let mode: Int
    let accent: UInt32
    let myBubble: UInt32
    let myText: UInt32
    let theirBubble: UInt32
    let theirText: UInt32
}

struct Wallpaper {
    let name: String
    let light: (UInt32, UInt32)
    let dark: (UInt32, UInt32)
    var style: WallpaperStyle = .gradient
    var preset: ThemePreset? = nil
}

enum Wallpapers {
    static let all: [Wallpaper] = [
        Wallpaper(name: "Çayır", light: (0xA9CDA0, 0xD9E6BF), dark: (0x0E1621, 0x0E1621)),
        Wallpaper(name: "Okyanus", light: (0x8EC5E8, 0xD3E9F5), dark: (0x0B1A2A, 0x10263B)),
        Wallpaper(name: "Gün batımı", light: (0xF2AE86, 0xF8DDC0), dark: (0x2A1515, 0x1A0F14)),
        Wallpaper(name: "Lavanta", light: (0xC3B5E8, 0xE6DEF6), dark: (0x1B1530, 0x120E22)),
        Wallpaper(name: "Gri", light: (0xD5D8DC, 0xEEF0F2), dark: (0x1C1C1E, 0x121214)),
        Wallpaper(name: "Masal Gezegeni", light: (0x24306A, 0xF4C9A2), dark: (0x10153A, 0x4A3A6A),
                  style: .storybook,
                  preset: ThemePreset(mode: 0, accent: 0xE9A23B, myBubble: 0xFFF1D6, myText: 0x3A2A10,
                                      theirBubble: 0xFFFFFF, theirText: 0x1E2A5A)),
        Wallpaper(name: "Olay Ufku", light: (0x05060A, 0x0B0D16), dark: (0x05060A, 0x0B0D16),
                  style: .eventHorizon,
                  preset: ThemePreset(mode: 2, accent: 0xF4A340, myBubble: 0x3A2814, myText: 0xFFE7B0,
                                      theirBubble: 0x1A1C24, theirText: 0xE6E8EF)),
        Wallpaper(name: "Laboratuvar", light: (0xE4F6F1, 0xF4FBF9), dark: (0x0C2226, 0x10292E),
                  style: .science,
                  preset: ThemePreset(mode: 1, accent: 0x1FA08A, myBubble: 0xD0F2EA, myText: 0x0D3B33,
                                      theirBubble: 0xFFFFFF, theirText: 0x16302B)),
        Wallpaper(name: "Uzay", light: (0x0B0F2E, 0x2A1550), dark: (0x0B0F2E, 0x2A1550),
                  style: .space,
                  preset: ThemePreset(mode: 2, accent: 0x8E7CFF, myBubble: 0x3B2C7A, myText: 0xF1EEFF,
                                      theirBubble: 0x1B1F3B, theirText: 0xE4E6FF))
    ]
    static let accents: [UInt32] = [0x2AA3E6, 0x34A853, 0x8E5CF7, 0xF2994A, 0xE84D8A, 0xE5484D, 0x5C6B7A]
    static var themed: [Int] { all.indices.filter { all[$0].preset != nil } }
}

struct Theme: Codable, Equatable {
    var mode: Int = 0                 // 0 sistem, 1 açık, 2 koyu
    var accent: UInt32 = 0x2AA3E6
    var myBubble: UInt32? = nil
    var myText: UInt32? = nil
    var theirBubble: UInt32? = nil
    var theirText: UInt32? = nil
    var fontSize: Double = 16
    var wallpaper: Int = 0
}

@MainActor
final class ThemeStore: ObservableObject {
    @Published var theme: Theme {
        didSet {
            if let d = try? JSONEncoder().encode(theme) { UserDefaults.standard.set(d, forKey: "theme") }
        }
    }

    init() {
        if let d = UserDefaults.standard.data(forKey: "theme"),
           let t = try? JSONDecoder().decode(Theme.self, from: d) {
            theme = t
        } else {
            theme = Theme()
        }
    }

    var scheme: ColorScheme? { theme.mode == 1 ? .light : theme.mode == 2 ? .dark : nil }
    var accent: Color { Color(UIColor(hex: theme.accent)) }
    var myBubble: Color { theme.myBubble.map { Color(UIColor(hex: $0)) } ?? .dyn(0xE2FCC9, 0x2B5278) }
    var theirBubble: Color { theme.theirBubble.map { Color(UIColor(hex: $0)) } ?? .dyn(0xFFFFFF, 0x182533) }
    var myText: Color { theme.myText.map { Color(UIColor(hex: $0)) } ?? .primary }
    var theirText: Color { theme.theirText.map { Color(UIColor(hex: $0)) } ?? .primary }
    var myMeta: Color { theme.myText.map { Color(UIColor(hex: $0)).opacity(0.65) } ?? .dyn(0x5DA75A, 0x8DB4DA) }
    var theirMeta: Color { theme.theirText.map { Color(UIColor(hex: $0)).opacity(0.6) } ?? .secondary }
    var font: Font { .system(size: theme.fontSize) }

    var wallpaperIndex: Int { min(max(theme.wallpaper, 0), Wallpapers.all.count - 1) }

    func apply(themeAt i: Int) {
        guard Wallpapers.all.indices.contains(i) else { return }
        var t = theme
        t.wallpaper = i
        if let p = Wallpapers.all[i].preset {
            t.mode = p.mode
            t.accent = p.accent
            t.myBubble = p.myBubble
            t.myText = p.myText
            t.theirBubble = p.theirBubble
            t.theirText = p.theirText
        }
        theme = t
    }

    func resetColors() {
        theme.myBubble = nil
        theme.myText = nil
        theme.theirBubble = nil
        theme.theirText = nil
    }
}

// MARK: - Renk yardımcıları

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

extension Color {
    static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }

    var hex: UInt32 {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
        func c(_ v: CGFloat) -> UInt32 { UInt32((min(max(v, 0), 1) * 255).rounded()) }
        return (c(r) << 16) | (c(g) << 8) | c(b)
    }

    static let tgBlue = Color(UIColor(hex: 0x2AA3E6))
    static let barBg = dyn(0xF7F7F7, 0x17212B)
    static let fieldBg = dyn(0xFFFFFF, 0x242F3D)
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
