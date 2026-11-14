import Foundation
import UIKit
import AVFoundation
import CoreTransferable
import UniformTypeIdentifiers

enum MediaError: Error { case tooLarge, unreadable }

/// Fotoğraf/video seçicisinden gelen video dosyası.
struct Movie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let dst = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
            try FileManager.default.copyItem(at: received.file, to: dst)
            return Movie(url: dst)
        }
    }
}

enum MediaTools {
    /// ntfy.sh dosya sınırı 15 MB; şifreleme payı için biraz altında kalıyoruz.
    static let maxBytes = 14_500_000

    static var dir: URL {
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Media", isDirectory: true)
        if !FileManager.default.fileExists(atPath: d.path) {
            try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true,
                                                     attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
            SecureFiles.excludeFromBackup(d)
        }
        return d
    }

    static func url(_ name: String) -> URL { dir.appendingPathComponent(name) }

    static func write(_ d: Data, name: String) throws {
        try d.write(to: url(name), options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    static func remove(_ name: String?) {
        guard let name else { return }
        try? FileManager.default.removeItem(at: url(name))
        try? FileManager.default.removeItem(at: url(name + ".jpg"))
    }

    static func removeAll() {
        try? FileManager.default.removeItem(at: dir)
    }

    static func resized(_ img: UIImage, maxSide: CGFloat) -> UIImage {
        let s = img.size
        let scale = min(1, maxSide / max(s.width, s.height, 1))
        let size = CGSize(width: max(1, (s.width * scale).rounded()), height: max(1, (s.height * scale).rounded()))
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: size, format: fmt).image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    static func thumb(_ img: UIImage) -> String? {
        resized(img, maxSide: 36).jpegData(compressionQuality: 0.35)?.base64EncodedString()
    }

    struct PreparedVideo {
        let url: URL
        let w: Double
        let h: Double
        let dur: Double
        let poster: UIImage?
    }

    /// Videoyu küçültür (gerekirse kaliteyi düşürerek) ve önizleme karesi çıkarır.
    static func prepareVideo(_ src: URL) async throws -> PreparedVideo {
        let asset = AVURLAsset(url: src)
        let dur = (try? await asset.load(.duration).seconds) ?? 0
        var w = 0.0, h = 0.0
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let pair = try? await track.load(.naturalSize, .preferredTransform) {
            let r = CGRect(origin: .zero, size: pair.0).applying(pair.1)
            w = abs(r.width)
            h = abs(r.height)
        }
        let poster = await posterImage(asset)

        for preset in [AVAssetExportPresetMediumQuality, AVAssetExportPreset640x480, AVAssetExportPresetLowQuality] {
            guard let ex = AVAssetExportSession(asset: asset, presetName: preset) else { continue }
            let out = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
            ex.outputURL = out
            ex.outputFileType = .mp4
            ex.shouldOptimizeForNetworkUse = true
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                ex.exportAsynchronously { c.resume() }
            }
            guard ex.status == .completed else { continue }
            let attrs = try? FileManager.default.attributesOfItem(atPath: out.path)
            let size = (attrs?[.size] as? NSNumber)?.intValue ?? Int.max
            if size <= maxBytes {
                try? FileManager.default.removeItem(at: src)
                return PreparedVideo(url: out, w: w, h: h, dur: dur, poster: poster)
            }
            try? FileManager.default.removeItem(at: out)
        }
        try? FileManager.default.removeItem(at: src)
        throw MediaError.tooLarge
    }

    static func posterImage(_ asset: AVAsset) async -> UIImage? {
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 720, height: 720)
        guard let cg = try? await gen.image(at: .zero).image else { return nil }
        return UIImage(cgImage: cg)
    }

    /// Alınan videonun önizleme karesini "<ad>.jpg" olarak kaydeder.
    static func makePoster(_ name: String) async {
        let asset = AVURLAsset(url: url(name))
        if let img = await posterImage(asset), let jpg = img.jpegData(compressionQuality: 0.7) {
            try? write(jpg, name: name + ".jpg")
        }
    }

    static func duration(_ s: Double) -> String {
        let t = max(0, Int(s.rounded()))
        return String(format: "%d:%02d", t / 60, t % 60)
    }
}

@MainActor
enum ImageCache {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(_ name: String) -> UIImage? {
        if let i = cache.object(forKey: name as NSString) { return i }
        guard let i = UIImage(contentsOfFile: MediaTools.url(name).path) else { return nil }
        cache.setObject(i, forKey: name as NSString)
        return i
    }

    static func clear() { cache.removeAllObjects() }
}
