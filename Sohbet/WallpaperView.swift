import SwiftUI
import UIKit

/// Sohbet arka planı: düz geçişler ve çizimli temalar (Masal Gezegeni, Olay Ufku, Laboratuvar, Uzay).
struct WallpaperView: View {
    let index: Int
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let w = Wallpapers.all[min(max(index, 0), Wallpapers.all.count - 1)]
        let dark = scheme == .dark
        let c = dark ? w.dark : w.light
        ZStack {
            LinearGradient(colors: [Color(UIColor(hex: c.0)), Color(UIColor(hex: c.1))],
                           startPoint: .top, endPoint: .bottom)
            switch w.style {
            case .gradient:
                EmptyView()
            case .storybook:
                Canvas { ctx, size in WallpaperPainter.storybook(&ctx, size, dark: dark) }
            case .eventHorizon:
                Canvas { ctx, size in WallpaperPainter.eventHorizon(&ctx, size) }
            case .science:
                Canvas { ctx, size in WallpaperPainter.science(&ctx, size, dark: dark) }
            case .space:
                Canvas { ctx, size in WallpaperPainter.space(&ctx, size) }
            }
        }
        .allowsHitTesting(false)
    }
}

/// Her açılışta aynı deseni üretmek için sabit tohumlu rastgele sayı üreteci.
struct SeededRNG: RandomNumberGenerator {
    var state: UInt64
    init(_ seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

enum WallpaperPainter {
    static func col(_ hex: UInt32, _ a: Double = 1) -> Color { Color(UIColor(hex: hex)).opacity(a) }

    static func sparkle(at p: CGPoint, r: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: p.x, y: p.y - r))
        path.addQuadCurve(to: CGPoint(x: p.x + r, y: p.y), control: p)
        path.addQuadCurve(to: CGPoint(x: p.x, y: p.y + r), control: p)
        path.addQuadCurve(to: CGPoint(x: p.x - r, y: p.y), control: p)
        path.addQuadCurve(to: CGPoint(x: p.x, y: p.y - r), control: p)
        return path
    }

    static func stars(_ ctx: inout GraphicsContext, _ size: CGSize, count: Int, maxY: CGFloat,
                      color: UInt32, seed: UInt64) {
        var rng = SeededRNG(seed)
        for _ in 0..<count {
            let x = CGFloat.random(in: 0...size.width, using: &rng)
            let y = CGFloat.random(in: 0...(size.height * maxY), using: &rng)
            let r = CGFloat.random(in: 0.6...2.0, using: &rng)
            let a = Double.random(in: 0.25...0.95, using: &rng)
            ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(col(color, a)))
        }
        for _ in 0..<max(3, count / 20) {
            let p = CGPoint(x: CGFloat.random(in: 0...size.width, using: &rng),
                            y: CGFloat.random(in: 0...(size.height * maxY), using: &rng))
            ctx.fill(sparkle(at: p, r: CGFloat.random(in: 5...9, using: &rng)), with: .color(col(color, 0.85)))
        }
    }

    static func ringedPlanet(_ ctx: inout GraphicsContext, center: CGPoint, r: CGFloat,
                             body: (UInt32, UInt32), ring: UInt32, tilt: Double) {
        let ringRect = CGRect(x: -r * 1.9, y: -r * 0.45, width: r * 3.8, height: r * 0.9)
        ctx.drawLayer { l in
            l.translateBy(x: center.x, y: center.y)
            l.rotate(by: .degrees(tilt))
            l.stroke(Path(ellipseIn: ringRect), with: .color(col(ring, 0.8)), lineWidth: r * 0.16)
        }
        ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                 with: .linearGradient(Gradient(colors: [col(body.0), col(body.1)]),
                                       startPoint: CGPoint(x: center.x - r, y: center.y - r),
                                       endPoint: CGPoint(x: center.x + r, y: center.y + r)))
        ctx.drawLayer { l in
            l.translateBy(x: center.x, y: center.y)
            l.rotate(by: .degrees(tilt))
            l.clip(to: Path(CGRect(x: -r * 2.2, y: 0, width: r * 4.4, height: r)))
            l.stroke(Path(ellipseIn: ringRect), with: .color(col(ring, 0.95)), lineWidth: r * 0.16)
        }
    }

    // MARK: - Masal Gezegeni: alacakaranlıkta yumuşak bir masal gökyüzü

    static func storybook(_ ctx: inout GraphicsContext, _ size: CGSize, dark: Bool) {
        let w = size.width, h = size.height
        stars(&ctx, size, count: 70, maxY: 0.55, color: 0xFFF4D6, seed: 11)

        // Hilal
        let m = CGPoint(x: w * 0.8, y: h * 0.12)
        var moon = Path(ellipseIn: CGRect(x: m.x - 26, y: m.y - 26, width: 52, height: 52))
        moon.addEllipse(in: CGRect(x: m.x - 14, y: m.y - 34, width: 52, height: 52))
        ctx.fill(moon, with: .color(col(0xFFE9B8, 0.95)), style: FillStyle(eoFill: true))

        // Uzaktaki küçük gezegen
        ringedPlanet(&ctx, center: CGPoint(x: w * 0.18, y: h * 0.3), r: 15,
                     body: (0xF7C6D9, 0xC98BD6), ring: 0xFFF4D6, tilt: -14)

        // Bulutlar
        var rng = SeededRNG(23)
        for _ in 0..<5 {
            let cx = CGFloat.random(in: 0...w, using: &rng)
            let cy = CGFloat.random(in: (h * 0.35)...(h * 0.62), using: &rng)
            let cw = CGFloat.random(in: 90...170, using: &rng)
            ctx.fill(Path(roundedRect: CGRect(x: cx - cw / 2, y: cy, width: cw, height: cw * 0.26), cornerRadius: cw * 0.13),
                     with: .color(col(0xFFFFFF, dark ? 0.06 : 0.16)))
        }

        // Alttaki yuvarlak tepeler
        ctx.fill(Path(ellipseIn: CGRect(x: -w * 0.3, y: h * 0.82, width: w * 1.1, height: h * 0.5)),
                 with: .color(col(dark ? 0x3A2E62 : 0xE9B48E, 0.75)))
        ctx.fill(Path(ellipseIn: CGRect(x: w * 0.25, y: h * 0.88, width: w * 1.2, height: h * 0.5)),
                 with: .color(col(dark ? 0x2A2350 : 0xDD9C7A, 0.85)))
    }

    // MARK: - Olay Ufku: ışık halkasıyla çevrili bir kara delik

    static func eventHorizon(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let w = size.width, h = size.height
        stars(&ctx, size, count: 150, maxY: 1, color: 0xFFFFFF, seed: 7)
        let c = CGPoint(x: w * 0.5, y: h * 0.3)
        let r = min(w, h) * 0.15
        let disk = CGRect(x: -r * 2.7, y: -r * 0.5, width: r * 5.4, height: r)

        // Arka disk ve parıltı
        ctx.drawLayer { l in
            l.translateBy(x: c.x, y: c.y)
            l.rotate(by: .degrees(-8))
            l.addFilter(.blur(radius: 14))
            l.stroke(Path(ellipseIn: disk), with: .color(col(0xF4A340, 0.55)), lineWidth: r * 0.45)
        }
        ctx.drawLayer { l in
            l.translateBy(x: c.x, y: c.y)
            l.rotate(by: .degrees(-8))
            l.stroke(Path(ellipseIn: disk), with: .color(col(0xFFD58A, 0.8)), lineWidth: r * 0.12)
        }
        // Foton halkası
        ctx.drawLayer { l in
            l.addFilter(.blur(radius: 10))
            l.stroke(Path(ellipseIn: CGRect(x: c.x - r * 1.1, y: c.y - r * 1.1, width: r * 2.2, height: r * 2.2)),
                     with: .color(col(0xFFC56B, 0.9)), lineWidth: r * 0.22)
        }
        ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r * 1.05, y: c.y - r * 1.05, width: r * 2.1, height: r * 2.1)),
                   with: .color(col(0xFFF1CF, 0.9)), lineWidth: 2)
        // Karanlık merkez
        ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(.black))
        // Önden geçen disk
        ctx.drawLayer { l in
            l.translateBy(x: c.x, y: c.y)
            l.rotate(by: .degrees(-8))
            l.clip(to: Path(CGRect(x: -r * 3, y: 0, width: r * 6, height: r)))
            l.stroke(Path(ellipseIn: disk), with: .color(col(0xFFB24D, 0.95)), lineWidth: r * 0.22)
            l.stroke(Path(ellipseIn: disk), with: .color(col(0xFFF1CF, 0.9)), lineWidth: 2)
        }
    }

    // MARK: - Laboratuvar: fen bilimleri simgeleriyle desen

    static let scienceSymbols = ["atom", "testtube.2", "leaf", "bolt", "lightbulb", "drop",
                                 "globe.europe.africa", "function", "waveform.path.ecg", "sun.max",
                                 "moon.stars", "thermometer.medium", "magnifyingglass", "gearshape"]

    static func science(_ ctx: inout GraphicsContext, _ size: CGSize, dark: Bool) {
        var rng = SeededRNG(42)
        let cell: CGFloat = 76
        let tint = col(dark ? 0x5FD3BC : 0x1FA08A, dark ? 0.22 : 0.2)
        let rows = Int(size.height / cell) + 2
        let cols = Int(size.width / cell) + 2
        for row in 0..<rows {
            for colIdx in 0..<cols {
                let x = CGFloat(colIdx) * cell + (row % 2 == 0 ? 0 : cell / 2) + CGFloat.random(in: -12...12, using: &rng)
                let y = CGFloat(row) * cell + CGFloat.random(in: -12...12, using: &rng)
                let rot = Double.random(in: -25...25, using: &rng)
                let s = CGFloat.random(in: 1.1...1.6, using: &rng)
                if Int.random(in: 0..<6, using: &rng) == 0 {
                    // Benzen halkası
                    var hex = Path()
                    for k in 0..<6 {
                        let a = Double(k) * .pi / 3
                        let p = CGPoint(x: x + 14 * CGFloat(cos(a)), y: y + 14 * CGFloat(sin(a)))
                        if k == 0 { hex.move(to: p) } else { hex.addLine(to: p) }
                    }
                    hex.closeSubpath()
                    ctx.stroke(hex, with: .color(tint), lineWidth: 2)
                    ctx.stroke(Path(ellipseIn: CGRect(x: x - 7, y: y - 7, width: 14, height: 14)), with: .color(tint), lineWidth: 1.5)
                    continue
                }
                let name = scienceSymbols[Int.random(in: 0..<scienceSymbols.count, using: &rng)]
                var img = ctx.resolve(Image(systemName: name))
                img.shading = .color(tint)
                ctx.drawLayer { l in
                    l.translateBy(x: x, y: y)
                    l.rotate(by: .degrees(rot))
                    l.scaleBy(x: s, y: s)
                    l.draw(img, at: .zero, anchor: .center)
                }
            }
        }
    }

    // MARK: - Uzay: bulutsular, yıldızlar ve gezegenler

    static func space(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let w = size.width, h = size.height
        let blobs: [(CGFloat, CGFloat, CGFloat, UInt32)] = [
            (0.2, 0.25, 0.55, 0x8E5CF7), (0.85, 0.55, 0.5, 0xE84D8A), (0.3, 0.85, 0.6, 0x2AA3E6)
        ]
        for b in blobs {
            let c = CGPoint(x: w * b.0, y: h * b.1)
            let rad = max(w, h) * b.2
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - rad, y: c.y - rad, width: rad * 2, height: rad * 2)),
                     with: .radialGradient(Gradient(colors: [col(b.3, 0.38), col(b.3, 0)]),
                                           center: c, startRadius: 0, endRadius: rad))
        }
        stars(&ctx, size, count: 170, maxY: 1, color: 0xFFFFFF, seed: 99)
        ringedPlanet(&ctx, center: CGPoint(x: w * 0.78, y: h * 0.16), r: 34,
                     body: (0xFFB37A, 0xE0607E), ring: 0x9FE8DE, tilt: -18)

        // Küçük ay
        let m = CGPoint(x: w * 0.16, y: h * 0.68)
        ctx.fill(Path(ellipseIn: CGRect(x: m.x - 20, y: m.y - 20, width: 40, height: 40)),
                 with: .linearGradient(Gradient(colors: [col(0xE8E6F0), col(0x9C98B8)]),
                                       startPoint: CGPoint(x: m.x - 20, y: m.y - 20),
                                       endPoint: CGPoint(x: m.x + 20, y: m.y + 20)))
        for (dx, dy, cr) in [(-6.0, -5.0, 5.0), (7.0, 4.0, 4.0), (-2.0, 9.0, 3.0)] {
            ctx.fill(Path(ellipseIn: CGRect(x: m.x + dx - cr, y: m.y + dy - cr, width: cr * 2, height: cr * 2)),
                     with: .color(col(0x7E7A9C, 0.6)))
        }

        // Kuyruklu yıldız
        var tail = Path()
        tail.move(to: CGPoint(x: w * 0.42, y: h * 0.42))
        tail.addLine(to: CGPoint(x: w * 0.6, y: h * 0.36))
        ctx.stroke(tail, with: .linearGradient(Gradient(colors: [col(0xFFFFFF, 0), col(0xFFFFFF, 0.8)]),
                                               startPoint: CGPoint(x: w * 0.42, y: h * 0.42),
                                               endPoint: CGPoint(x: w * 0.6, y: h * 0.36)),
                   style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
        ctx.fill(Path(ellipseIn: CGRect(x: w * 0.6 - 3, y: h * 0.36 - 3, width: 6, height: 6)), with: .color(.white))
    }
}
