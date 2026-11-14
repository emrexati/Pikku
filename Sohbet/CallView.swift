import SwiftUI
import UIKit
import WebRTC

@MainActor
struct CallView: View {
    @EnvironmentObject var call: CallManager
    @EnvironmentObject var model: AppModel

    private var name: String { model.peerName.isEmpty ? "Karşı taraf" : model.peerName }
    private var showRemoteVideo: Bool { call.isVideo && call.remoteVideo != nil && call.state == .active }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(UIColor(hex: 0x24486B)), Color(UIColor(hex: 0x0E1621))],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            if showRemoteVideo, let r = call.remoteVideo {
                VideoView(track: r, mirror: false).ignoresSafeArea()
            }

            VStack(spacing: 0) {
                header
                Spacer()
                controls.padding(.bottom, 24)
            }
            .padding(.horizontal, 20)

            if call.isVideo, let l = call.localVideo, !call.cameraOff {
                VideoView(track: l, mirror: call.frontCamera)
                    .frame(width: 108, height: 156)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.35), lineWidth: 1))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(.top, showRemoteVideo ? 70 : 12)
                    .padding(.trailing, 16)
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(showRemoteVideo)
    }

    @ViewBuilder private var header: some View {
        if showRemoteVideo {
            VStack(spacing: 2) {
                Text(name).font(.headline)
                statusText.font(.subheadline)
            }
            .foregroundColor(.white)
            .shadow(radius: 4)
            .padding(.top, 8)
        } else {
            VStack(spacing: 14) {
                Avatar(name: name, size: 120).padding(.top, 70)
                Text(name).font(.title.bold()).foregroundColor(.white)
                statusText.font(.callout).foregroundColor(.white.opacity(0.75))
            }
        }
    }

    @ViewBuilder private var statusText: some View {
        switch call.state {
        case .incoming:
            Text(call.isVideo ? "Görüntülü arama geliyor…" : "Sesli arama geliyor…")
        case .outgoing:
            Text("Çalıyor…")
        case .connecting:
            Text("Bağlanıyor…")
        case .active:
            if call.reconnecting {
                Text("Yeniden bağlanıyor…")
            } else if let s = call.startedAt {
                TimelineView(.periodic(from: s, by: 1)) { ctx in
                    Text(Self.format(ctx.date.timeIntervalSince(s))).monospacedDigit()
                }
            } else {
                Text("Bağlandı")
            }
        case .idle:
            Text("")
        }
    }

    @ViewBuilder private var controls: some View {
        if call.state == .incoming {
            HStack(spacing: 80) {
                RoundButton(icon: "phone.down.fill", label: "Reddet", fill: .red) { call.reject() }
                RoundButton(icon: call.isVideo ? "video.fill" : "phone.fill", label: "Kabul et", fill: .green) { call.accept() }
            }
        } else {
            HStack(spacing: 16) {
                RoundButton(icon: call.muted ? "mic.slash.fill" : "mic.fill", label: "Sessiz", active: call.muted) {
                    call.toggleMute()
                }
                if call.isVideo {
                    RoundButton(icon: call.cameraOff ? "video.slash.fill" : "video.fill", label: "Kamera", active: call.cameraOff) {
                        call.toggleCamera()
                    }
                    RoundButton(icon: "arrow.triangle.2.circlepath.camera", label: "Çevir") {
                        call.flipCamera()
                    }
                } else {
                    RoundButton(icon: "speaker.wave.2.fill", label: "Hoparlör", active: call.speaker) {
                        call.toggleSpeaker()
                    }
                }
                RoundButton(icon: "phone.down.fill", label: "Bitir", fill: .red) { call.hangup() }
            }
        }
    }

    static func format(_ t: TimeInterval) -> String {
        let s = max(0, Int(t))
        return s >= 3600
            ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String(format: "%d:%02d", s / 60, s % 60)
    }
}

@MainActor
struct RoundButton: View {
    let icon: String
    let label: String
    var fill: Color? = nil
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(fill == nil && active ? .black : .white)
                    .frame(width: 66, height: 66)
                    .background(Circle().fill(fill ?? (active ? Color.white : Color.white.opacity(0.18))))
                Text(label).font(.caption).foregroundColor(.white.opacity(0.85))
            }
        }
        .buttonStyle(.plain)
    }
}

/// WebRTC video izini gösteren UIKit görünümü.
struct VideoView: UIViewRepresentable {
    let track: RTCVideoTrack
    var mirror: Bool

    final class Coordinator { var track: RTCVideoTrack? }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let v = RTCMTLVideoView(frame: .zero)
        v.videoContentMode = .scaleAspectFill
        v.clipsToBounds = true
        return v
    }

    func updateUIView(_ v: RTCMTLVideoView, context: Context) {
        v.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        if context.coordinator.track !== track {
            context.coordinator.track?.remove(v)
            track.add(v)
            context.coordinator.track = track
        }
    }

    static func dismantleUIView(_ v: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(v)
        coordinator.track = nil
    }
}
