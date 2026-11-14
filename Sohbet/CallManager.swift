import Foundation
import AVFoundation
import AudioToolbox
import UIKit
import WebRTC

enum CallState: Equatable { case idle, outgoing, incoming, connecting, active }

enum CallError: Error { case peer, sdp }

/// Sesli / görüntülü görüşme (WebRTC, eşler arası).
@MainActor
final class CallManager: NSObject, ObservableObject {
    @Published private(set) var state: CallState = .idle
    @Published private(set) var isVideo = false
    @Published private(set) var muted = false
    @Published private(set) var speaker = false
    @Published private(set) var cameraOff = false
    @Published private(set) var frontCamera = true
    @Published private(set) var reconnecting = false
    @Published private(set) var startedAt: Date?
    @Published private(set) var localVideo: RTCVideoTrack?
    @Published private(set) var remoteVideo: RTCVideoTrack?

    var sendSignal: (@MainActor (EnvelopeKind, String, Bool, String) async -> Bool)?
    var log: (@MainActor (String) -> Void)?

    private var iceServers: [RTCIceServer] = []
    private var pc: RTCPeerConnection?
    private var capturer: RTCCameraVideoCapturer?
    private var localAudio: RTCAudioTrack?
    private var callId = ""
    private var pendingOffer: String?
    private var ringTimer: Timer?
    private var timeoutTask: Task<Void, Never>?

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(),
                                        decoderFactory: RTCDefaultVideoDecoderFactory())
    }()

    override init() {
        super.init()
        configure(turnURL: "", user: "", pass: "")
    }

    func configure(turnURL: String, user: String, pass: String) {
        var list = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302",
                                              "stun:stun1.l.google.com:19302",
                                              "stun:stun.cloudflare.com:3478"])]
        let t = turnURL.trimmingCharacters(in: .whitespaces)
        if !t.isEmpty {
            list.append(RTCIceServer(urlStrings: [t], username: user, credential: pass))
        }
        iceServers = list
    }

    // MARK: - Arama başlat

    func start(video: Bool) {
        guard state == .idle else { return }
        callId = UUID().uuidString
        isVideo = video
        resetFlags()
        state = .outgoing
        let id = callId
        Task {
            guard await permissions(video: video) else {
                log?("Mikrofon/kamera izni verilmedi")
                cleanup()
                return
            }
            guard state == .outgoing, callId == id else { return }
            do {
                try makePeer(video: video)
                let offer = try await createOffer()
                try await setLocal(offer)
                await waitGathering()
                guard state == .outgoing, callId == id, let sdp = pc?.localDescription?.sdp else { return }
                let ok = await sendSignal?(.offer, sdp, video, id) ?? false
                guard state == .outgoing, callId == id else { return }
                if !ok {
                    log?("Arama gönderilemedi — internet bağlantısını kontrol et")
                    cleanup()
                    return
                }
                timeoutTask = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: 45_000_000_000)
                    guard let self, !Task.isCancelled, self.state == .outgoing, self.callId == id else { return }
                    self.end(notify: .hangup, text: "Cevap verilmedi")
                }
            } catch {
                log?("Arama başlatılamadı")
                cleanup()
            }
        }
    }

    // MARK: - Gelen sinyaller

    func handle(_ env: Envelope) {
        let age = Date().timeIntervalSince1970 - env.ts
        switch env.kind {
        case .offer:
            let video = env.video ?? false
            guard age < 40 else {
                log?(video ? "Cevapsız görüntülü arama" : "Cevapsız sesli arama")
                return
            }
            guard state == .idle else {
                if let id = env.callId, id != callId {
                    Task { _ = await sendSignal?(.busy, "", false, id) }
                }
                return
            }
            callId = env.callId ?? UUID().uuidString
            pendingOffer = env.body
            isVideo = video
            resetFlags()
            state = .incoming
            startRinging()
            let id = callId
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 45_000_000_000)
                guard let self, !Task.isCancelled, self.state == .incoming, self.callId == id else { return }
                self.log?(video ? "Cevapsız görüntülü arama" : "Cevapsız sesli arama")
                self.cleanup()
            }

        case .answer:
            guard state == .outgoing, env.callId == callId else { return }
            timeoutTask?.cancel()
            state = .connecting
            Task {
                do {
                    try await setRemote(RTCSessionDescription(type: .answer, sdp: env.body))
                    attachRemoteVideo()
                } catch {
                    end(notify: .hangup, text: "Bağlantı kurulamadı")
                }
            }

        case .hangup, .reject, .busy:
            guard env.callId == callId, state != .idle else { return }
            let text: String
            switch env.kind {
            case .reject: text = "Arama reddedildi"
            case .busy: text = "Karşı taraf başka bir görüşmede"
            default: text = state == .incoming ? (isVideo ? "Cevapsız görüntülü arama" : "Cevapsız sesli arama") : summary()
            }
            log?(text)
            cleanup()

        default:
            break
        }
    }

    // MARK: - Kullanıcı eylemleri

    func accept() {
        guard state == .incoming, let offer = pendingOffer else { return }
        stopRinging()
        timeoutTask?.cancel()
        state = .connecting
        let id = callId
        let video = isVideo
        Task {
            guard await permissions(video: video) else {
                end(notify: .reject, text: "Mikrofon/kamera izni verilmedi")
                return
            }
            do {
                try makePeer(video: video)
                try await setRemote(RTCSessionDescription(type: .offer, sdp: offer))
                let answer = try await createAnswer()
                try await setLocal(answer)
                await waitGathering()
                attachRemoteVideo()
                guard state == .connecting || state == .active, callId == id,
                      let sdp = pc?.localDescription?.sdp else { return }
                let ok = await sendSignal?(.answer, sdp, video, id) ?? false
                if !ok, callId == id { end(notify: nil, text: "Bağlantı kurulamadı") }
            } catch {
                end(notify: .hangup, text: "Bağlantı kurulamadı")
            }
        }
    }

    func reject() {
        guard state == .incoming else { return }
        end(notify: .reject, text: "Arama reddedildi")
    }

    func hangup() {
        guard state != .idle else { return }
        end(notify: .hangup, text: state == .outgoing ? "Arama iptal edildi" : summary())
    }

    func toggleMute() {
        muted.toggle()
        localAudio?.isEnabled = !muted
    }

    func toggleSpeaker() {
        setSpeaker(!speaker)
    }

    func toggleCamera() {
        cameraOff.toggle()
        localVideo?.isEnabled = !cameraOff
    }

    func flipCamera() {
        frontCamera.toggle()
        startCapture()
    }

    // MARK: - WebRTC kurulum

    private func makePeer(video: Bool) throws {
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherOnce
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil,
                                              optionalConstraints: ["DtlsSrtpKeyAgreement": kRTCMediaConstraintsValueTrue])
        guard let peer = Self.factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            throw CallError.peer
        }
        pc = peer

        configureAudioSession(video: video)

        let audioSource = Self.factory.audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
        let audio = Self.factory.audioTrack(with: audioSource, trackId: "audio0")
        peer.add(audio, streamIds: ["stream0"])
        localAudio = audio

        if video {
            let source = Self.factory.videoSource()
            let cap = RTCCameraVideoCapturer(delegate: source)
            let track = Self.factory.videoTrack(with: source, trackId: "video0")
            peer.add(track, streamIds: ["stream0"])
            capturer = cap
            localVideo = track
            startCapture()
        }

        UIApplication.shared.isIdleTimerDisabled = true
        UIDevice.current.isProximityMonitoringEnabled = !video
    }

    private func configureAudioSession(video: Bool) {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat,
                           options: [.allowBluetooth, .allowBluetoothA2DP])
        try? s.setActive(true)
        setSpeaker(video)
    }

    private func setSpeaker(_ on: Bool) {
        speaker = on
        try? AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }

    private func startCapture() {
        guard let cap = capturer else { return }
        let devices = RTCCameraVideoCapturer.captureDevices()
        let wanted: AVCaptureDevice.Position = frontCamera ? .front : .back
        guard let device = devices.first(where: { $0.position == wanted }) ?? devices.first else { return }
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        func width(_ f: AVCaptureDevice.Format) -> Int32 {
            CMVideoFormatDescriptionGetDimensions(f.formatDescription).width
        }
        guard let format = formats.min(by: { abs(width($0) - 1280) < abs(width($1) - 1280) }) else { return }
        let maxFps = format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 30
        cap.startCapture(with: device, format: format, fps: Int(min(maxFps, 30)))
    }

    private func constraints() -> RTCMediaConstraints {
        RTCMediaConstraints(mandatoryConstraints: [
            kRTCMediaConstraintsOfferToReceiveAudio: kRTCMediaConstraintsValueTrue,
            kRTCMediaConstraintsOfferToReceiveVideo: isVideo ? kRTCMediaConstraintsValueTrue : kRTCMediaConstraintsValueFalse
        ], optionalConstraints: nil)
    }

    private func createOffer() async throws -> RTCSessionDescription {
        guard let peer = pc else { throw CallError.peer }
        let c = constraints()
        return try await withCheckedThrowingContinuation { cont in
            peer.offer(for: c, completionHandler: { sdp, error in
                if let sdp { cont.resume(returning: sdp) } else { cont.resume(throwing: error ?? CallError.sdp) }
            })
        }
    }

    private func createAnswer() async throws -> RTCSessionDescription {
        guard let peer = pc else { throw CallError.peer }
        let c = constraints()
        return try await withCheckedThrowingContinuation { cont in
            peer.answer(for: c, completionHandler: { sdp, error in
                if let sdp { cont.resume(returning: sdp) } else { cont.resume(throwing: error ?? CallError.sdp) }
            })
        }
    }

    private func setLocal(_ sdp: RTCSessionDescription) async throws {
        guard let peer = pc else { throw CallError.peer }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            peer.setLocalDescription(sdp, completionHandler: { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            })
        }
    }

    private func setRemote(_ sdp: RTCSessionDescription) async throws {
        guard let peer = pc else { throw CallError.peer }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            peer.setRemoteDescription(sdp, completionHandler: { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            })
        }
    }

    /// Adayları tek mesajda göndermek için toplama işleminin bitmesini bekler (en çok 4 sn).
    private func waitGathering() async {
        for _ in 0..<40 {
            guard let peer = pc else { return }
            if peer.iceGatheringState == .complete { return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    private func attachRemoteVideo() {
        guard isVideo else { return }
        if let track = pc?.transceivers.first(where: { $0.mediaType == .video })?.receiver.track as? RTCVideoTrack {
            remoteVideo = track
        }
    }

    fileprivate func iceChanged(_ s: RTCIceConnectionState, peer: RTCPeerConnection) {
        guard peer === pc else { return }
        switch s {
        case .connected, .completed:
            reconnecting = false
            if state != .active {
                state = .active
                startedAt = Date()
                attachRemoteVideo()
                setSpeaker(speaker)
            }
        case .disconnected:
            if state == .active { reconnecting = true }
        case .failed:
            end(notify: .hangup, text: state == .active
                ? "Bağlantı koptu"
                : "Bağlantı kurulamadı (ağ engeli olabilir, Ayarlar'dan TURN ekleyebilirsin)")
        default:
            break
        }
    }

    // MARK: - Bitiş

    private func end(notify: EnvelopeKind?, text: String?) {
        if let kind = notify {
            let id = callId
            Task { _ = await sendSignal?(kind, "", isVideo, id) }
        }
        if let text { log?(text) }
        cleanup()
    }

    private func summary() -> String {
        let kind = isVideo ? "Görüntülü arama" : "Sesli arama"
        guard let s = startedAt else { return "\(kind) iptal edildi" }
        let sec = Int(Date().timeIntervalSince(s))
        return String(format: "%@ · %d:%02d", kind, sec / 60, sec % 60)
    }

    private func resetFlags() {
        muted = false
        cameraOff = false
        frontCamera = true
        reconnecting = false
        startedAt = nil
    }

    private func cleanup() {
        stopRinging()
        timeoutTask?.cancel()
        timeoutTask = nil
        capturer?.stopCapture()
        capturer = nil
        localVideo = nil
        remoteVideo = nil
        localAudio = nil
        pc?.close()
        pc = nil
        pendingOffer = nil
        startedAt = nil
        reconnecting = false
        state = .idle
        UIApplication.shared.isIdleTimerDisabled = false
        UIDevice.current.isProximityMonitoringEnabled = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Zil ve izinler

    private func startRinging() {
        stopRinging()
        AudioServicesPlayAlertSound(SystemSoundID(1005))
        ringTimer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { _ in
            AudioServicesPlayAlertSound(SystemSoundID(1005))
        }
    }

    private func stopRinging() {
        ringTimer?.invalidate()
        ringTimer = nil
    }

    private func permissions(video: Bool) async -> Bool {
        let mic = await AVCaptureDevice.requestAccess(for: .audio)
        guard video else { return mic }
        let cam = await AVCaptureDevice.requestAccess(for: .video)
        return mic && cam
    }
}

// MARK: - WebRTC geri çağrıları

extension CallManager: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in self.iceChanged(newState, peer: peerConnection) }
    }
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
