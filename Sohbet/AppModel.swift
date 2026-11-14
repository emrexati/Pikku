import Foundation
import SwiftUI
import UIKit
import CryptoKit
import LocalAuthentication

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var config: Config?
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var connected = false
    @Published private(set) var peerName = UserDefaults.standard.string(forKey: "peerName") ?? ""
    @Published private(set) var peerOnline = false
    @Published private(set) var peerLastSeen: Date? = UserDefaults.standard.object(forKey: "peerLastSeen") as? Date
    @Published private(set) var peerTyping = false
    @Published private(set) var ttl: Double = UserDefaults.standard.double(forKey: "ttl")
    @Published private(set) var locked = false
    @Published private(set) var preparing = false
    @Published private(set) var busy: String?
    @Published var toast: String?

    let call = CallManager()

    private var relay: Relay?
    private var crypto: RoomCrypto?
    private var seen = Set<String>()
    private var isActive = true
    private var lastTypingSent = Date.distantPast
    private var lastPresenceSent = Date.distantPast
    private var lastPeerPing = Date.distantPast
    private var lastReadSentTs = UserDefaults.standard.double(forKey: "lastReadSentTs")
    private var typingClear: Task<Void, Never>?
    private var readTask: Task<Void, Never>?
    private var ticker: Timer?
    private var screenshotObserver: NSObjectProtocol?

    static let maxLength = 1500
    static let ttlOptions: [(Double, String)] = [
        (0, "Kapalı"), (30, "30 saniye"), (300, "5 dakika"),
        (3600, "1 saat"), (86400, "1 gün"), (604800, "1 hafta")
    ]

    static func ttlLabel(_ v: Double) -> String {
        ttlOptions.first(where: { $0.0 == v })?.1 ?? "\(Int(v)) sn"
    }

    var displayPeer: String { peerName.isEmpty ? "Karşı taraf" : peerName }

    init() {
        if let d = Keychain.get("config"), let c = try? JSONDecoder().decode(Config.self, from: d),
           let master = Keychain.get("master") {
            config = c
            crypto = RoomCrypto(master: master)
            locked = c.appLock
            call.configure(turnURL: c.turnURL, user: c.turnUser, pass: c.turnPass)
        }
        loadMessages()

        call.sendSignal = { [weak self] kind, body, video, callId in
            guard let self, var env = self.makeEnv(kind, body: body) else { return false }
            env.video = video
            env.callId = callId
            if await self.post(env) { return true }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            return await self.post(env)
        }
        call.log = { [weak self] text in self?.appendSystem(text) }

        startRelay()

        ticker = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        screenshotObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.screenshotTaken() }
        }
    }

    // MARK: - Kurulum ve ayarlar

    func setup(name: String, code: String) {
        let n = name.trimmed
        let c = code.trimmed.uppercased()
        guard !n.isEmpty, KeyDerivation.normalize(c).count >= 12, !preparing else { return }
        preparing = true
        Task {
            let master = await Task.detached(priority: .userInitiated) { KeyDerivation.master(from: c) }.value
            Keychain.set(master, for: "master")
            crypto = RoomCrypto(master: master)
            let cfg = Config(myName: n, code: c)
            saveConfig(cfg)
            config = cfg
            call.configure(turnURL: cfg.turnURL, user: cfg.turnUser, pass: cfg.turnPass)
            preparing = false
            startRelay()
        }
    }

    func update(_ c: Config) {
        let serverChanged = c.server != config?.server
        let presenceTurnedOff = config?.showPresence == true && !c.showPresence
        if presenceTurnedOff { sendPresence(false, force: true) }
        config = c
        saveConfig(c)
        call.configure(turnURL: c.turnURL, user: c.turnUser, pass: c.turnPass)
        if serverChanged { startRelay() }
        if c.showPresence { sendPresence(true, force: true) }
    }

    private func saveConfig(_ c: Config) {
        if let d = try? JSONEncoder().encode(c) { Keychain.set(d, for: "config") }
    }

    func resetPairing() {
        sendPresence(false, force: true)
        relay?.stop()
        relay = nil
        crypto = nil
        connected = false
        config = nil
        Keychain.delete("config")
        Keychain.delete("master")
        clearLocal()
        setPeerName("")
        peerLastSeen = nil
        UserDefaults.standard.removeObject(forKey: "peerLastSeen")
        ttl = 0
        UserDefaults.standard.removeObject(forKey: "ttl")
        lastReadSentTs = 0
        UserDefaults.standard.removeObject(forKey: "lastReadSentTs")
    }

    // MARK: - Uygulama durumu, kilit

    func setActive(_ active: Bool) {
        isActive = active
        if active {
            relay?.reconnectNow()
            sendPresence(true, force: true)
            scheduleRead()
        } else {
            sendPresence(false, force: true)
            peerTyping = false
            if config?.appLock == true { locked = true }
        }
    }

    static var canUseLock: Bool {
        var err: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
    }

    func unlock() async {
        guard locked else { return }
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            locked = false
            return
        }
        let ok = (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication,
                                                localizedReason: "Sohbeti açmak için kimliğini doğrula")) ?? false
        if ok {
            locked = false
            scheduleRead()
        }
    }

    // MARK: - Mesaj gönderme

    func sendText(_ text: String, replyTo: String?) {
        let t = String(text.trimmed.prefix(Self.maxLength))
        guard !t.isEmpty, config != nil else { return }
        var m = newOutgoing()
        m.text = t
        m.replyTo = replyTo
        messages.append(m)
        save()
        deliver(m)
    }

    func editText(_ m: ChatMessage, to text: String) {
        let t = String(text.trimmed.prefix(Self.maxLength))
        guard m.mine, m.media == nil, !t.isEmpty, t != m.text,
              let i = messages.firstIndex(where: { $0.id == m.id }) else { return }
        messages[i].text = t
        messages[i].edited = true
        save()
        guard var env = makeEnv(.edit, body: t) else { return }
        env.target = m.id
        fire(env)
    }

    func retry(_ m: ChatMessage) {
        if m.mine {
            if m.media != nil, m.media?.url.isEmpty ?? true {
                upload(m.id)
            } else if m.status == .failed {
                setStatus(m.id, .sending)
                deliver(m)
            }
        } else if m.media != nil, m.mediaState == .failed {
            download(m.id)
        }
    }

    private func newOutgoing() -> ChatMessage {
        let now = Date()
        var m = ChatMessage(id: UUID().uuidString, text: "", mine: true, date: now, status: .sending)
        m.ts = now.timeIntervalSince1970
        if ttl > 0 { m.expiresAt = now.addingTimeInterval(ttl) }
        return m
    }

    private func deliver(_ m: ChatMessage) {
        guard var env = makeEnv(m.media == nil ? .text : .media, body: m.text,
                                id: m.id, ts: m.ts ?? m.date.timeIntervalSince1970) else { return }
        env.replyTo = m.replyTo
        env.media = m.media
        if let e = m.expiresAt { env.ttl = max(1, e.timeIntervalSince(m.date)) }
        Task {
            let ok = await post(env)
            setStatus(m.id, ok ? .sent : .failed)
        }
    }

    // MARK: - Fotoğraf ve video

    func sendImage(_ data: Data) {
        guard let img = UIImage(data: data) else { toast = "Fotoğraf açılamadı"; return }
        let r = MediaTools.resized(img, maxSide: 1600)
        guard let jpg = r.jpegData(compressionQuality: 0.75) else { return }
        var m = newOutgoing()
        let name = m.id + ".jpg"
        do { try MediaTools.write(jpg, name: name) } catch { toast = "Fotoğraf kaydedilemedi"; return }
        m.media = MediaInfo(url: "", kind: "image", size: jpg.count,
                            w: Double(r.size.width), h: Double(r.size.height), dur: nil, thumb: MediaTools.thumb(r))
        m.localFile = name
        m.mediaState = .uploading
        messages.append(m)
        save()
        upload(m.id)
    }

    func sendVideo(_ url: URL) async {
        busy = "Video hazırlanıyor…"
        defer { busy = nil }
        do {
            let v = try await MediaTools.prepareVideo(url)
            var m = newOutgoing()
            let name = m.id + ".mp4"
            let raw = try Data(contentsOf: v.url)
            try MediaTools.write(raw, name: name)
            try? FileManager.default.removeItem(at: v.url)
            if let p = v.poster, let jpg = p.jpegData(compressionQuality: 0.7) {
                try? MediaTools.write(jpg, name: name + ".jpg")
            }
            m.media = MediaInfo(url: "", kind: "video", size: raw.count, w: v.w, h: v.h, dur: v.dur,
                                thumb: v.poster.flatMap { MediaTools.thumb($0) })
            m.localFile = name
            m.mediaState = .uploading
            messages.append(m)
            save()
            upload(m.id)
        } catch MediaError.tooLarge {
            toast = "Video çok büyük. Yaklaşık 1-2 dakikadan kısa bir video seç."
        } catch {
            toast = "Video hazırlanamadı"
        }
    }

    private func upload(_ id: String) {
        guard let m = messages.first(where: { $0.id == id }), let file = m.localFile,
              let rc = crypto, let relay else { return }
        setMedia(id, .uploading)
        setStatus(id, .sending)
        Task {
            do {
                let raw = try Data(contentsOf: MediaTools.url(file))
                let sealed = try rc.sealData(raw)
                let url = try await relay.upload(sealed, topic: rc.mediaTopic)
                guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
                messages[i].media?.url = url
                messages[i].mediaState = .ready
                save()
                deliver(messages[i])
            } catch {
                setMedia(id, .failed)
                setStatus(id, .failed)
                toast = (error as? RelayError) == .tooLarge
                    ? "Dosya sunucu sınırını (15 MB) aşıyor"
                    : "Gönderilemedi, tekrar denemek için dokun"
            }
        }
    }

    func download(_ id: String) {
        guard let m = messages.first(where: { $0.id == id }), let media = m.media,
              let rc = crypto, let relay else { return }
        setMedia(id, .downloading)
        Task {
            do {
                let enc = try await relay.download(media.url)
                let raw = try rc.openData(enc)
                let name = id + (media.isVideo ? ".mp4" : ".jpg")
                try MediaTools.write(raw, name: name)
                if media.isVideo { await MediaTools.makePoster(name) }
                guard let i = messages.firstIndex(where: { $0.id == id }) else {
                    MediaTools.remove(name)
                    return
                }
                messages[i].localFile = name
                messages[i].mediaState = .ready
                save()
            } catch {
                setMedia(id, (error as? RelayError) == .expired ? .expired : .failed)
            }
        }
    }

    // MARK: - Silme

    func deleteForMe(_ m: ChatMessage) {
        removeMessage(m.id)
    }

    func deleteForAll(_ m: ChatMessage) {
        removeMessage(m.id)
        guard var env = makeEnv(.delete) else { return }
        env.target = m.id
        fire(env)
    }

    func clearForMe() {
        clearLocal()
    }

    func clearForAll() {
        clearLocal()
        fire(makeEnv(.clear))
    }

    func setTTL(_ v: Double) {
        guard v != ttl else { return }
        ttl = v
        UserDefaults.standard.set(v, forKey: "ttl")
        fire(makeEnv(.ttl, body: String(v)))
        appendSystem(v > 0 ? "Otomatik silme: \(Self.ttlLabel(v))" : "Otomatik silme kapatıldı")
    }

    private func removeMessage(_ id: String) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        MediaTools.remove(messages[i].localFile)
        messages.remove(at: i)
        save()
    }

    private func clearLocal() {
        messages = []
        MediaTools.removeAll()
        ImageCache.clear()
        save()
    }

    // MARK: - Çevrimiçi, yazıyor, okundu

    func userTyping() {
        guard config?.showPresence == true, Date().timeIntervalSince(lastTypingSent) > 5 else { return }
        lastTypingSent = Date()
        fire(makeEnv(.typing), cache: false)
    }

    var peerStatus: String {
        if !connected { return "bağlanıyor…" }
        if peerTyping { return "yazıyor…" }
        guard config?.showPresence == true else { return "uçtan uca şifreli" }
        if peerOnline { return "çevrimiçi" }
        guard let d = peerLastSeen else { return "uçtan uca şifreli" }
        return "son görülme " + Self.lastSeenText(d)
    }

    static func lastSeenText(_ d: Date) -> String {
        let s = Date().timeIntervalSince(d)
        if s < 60 { return "az önce" }
        if s < 3600 { return "\(Int(s / 60)) dk önce" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "HH:mm"
        if Calendar.current.isDateInToday(d) { return "bugün " + f.string(from: d) }
        if Calendar.current.isDateInYesterday(d) { return "dün " + f.string(from: d) }
        f.dateFormat = "d MMM HH:mm"
        return f.string(from: d)
    }

    private func sendPresence(_ on: Bool, force: Bool) {
        guard let c = config else { return }
        guard c.showPresence || !on else { return }
        if on, !force, Date().timeIntervalSince(lastPresenceSent) < 40 { return }
        lastPresenceSent = on ? Date() : .distantPast
        guard let env = makeEnv(.presence, body: on ? "on" : "off") else { return }
        if on {
            fire(env, cache: false)
        } else {
            let bg = UIApplication.shared.beginBackgroundTask(expirationHandler: nil)
            Task {
                _ = await post(env, cache: false)
                UIApplication.shared.endBackgroundTask(bg)
            }
        }
    }

    private func setLastSeen(_ d: Date) {
        peerLastSeen = d
        UserDefaults.standard.set(d, forKey: "peerLastSeen")
    }

    private func scheduleRead() {
        guard isActive, !locked, config?.readReceipts == true else { return }
        readTask?.cancel()
        readTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled, isActive, !locked else { return }
            let maxTs = messages.filter { !$0.mine && $0.system != true }.compactMap { $0.ts }.max() ?? 0
            guard maxTs > lastReadSentTs else { return }
            lastReadSentTs = maxTs
            UserDefaults.standard.set(maxTs, forKey: "lastReadSentTs")
            fire(makeEnv(.read, body: String(maxTs)))
        }
    }

    private func screenshotTaken() {
        guard config != nil, isActive, !locked else { return }
        appendSystem("Ekran görüntüsü aldın")
        fire(makeEnv(.screenshot))
    }

    private func tick() {
        if isActive { sendPresence(true, force: false) }
        if peerOnline, Date().timeIntervalSince(lastPeerPing) > 70 {
            peerOnline = false
            peerTyping = false
        }
        let now = Date()
        let expired = messages.filter { ($0.expiresAt ?? .distantFuture) <= now }
        if !expired.isEmpty {
            expired.forEach { MediaTools.remove($0.localFile) }
            messages.removeAll { ($0.expiresAt ?? .distantFuture) <= now }
            save()
        }
    }

    // MARK: - Sunucu bağlantısı

    private func makeEnv(_ kind: EnvelopeKind, body: String = "", id: String = UUID().uuidString,
                         ts: Double = Date().timeIntervalSince1970) -> Envelope? {
        guard let c = config else { return nil }
        return Envelope(id: id, from: c.deviceId, name: c.myName, kind: kind, body: body, ts: ts)
    }

    private func post(_ env: Envelope, cache: Bool = true) async -> Bool {
        guard let rc = crypto, let relay else { return false }
        do {
            var e = env
            var sealed = try rc.seal(e)
            if sealed.utf8.count > 3900, e.media?.thumb != nil {
                e.media?.thumb = nil
                sealed = try rc.seal(e)
            }
            guard sealed.utf8.count <= 4000 else { return false }
            try await relay.publish(sealed, cache: cache)
            return true
        } catch {
            return false
        }
    }

    private func fire(_ env: Envelope?, cache: Bool = true) {
        guard let env else { return }
        Task { _ = await post(env, cache: cache) }
    }

    private func startRelay() {
        relay?.stop()
        relay = nil
        connected = false
        guard let c = config, let rc = crypto, let url = URL(string: c.server) else { return }
        let since = UserDefaults.standard.string(forKey: "since-\(rc.topic)") ?? "12h"
        let r = Relay(server: url, topic: rc.topic, since: since)
        r.onState = { [weak self] ok in
            guard let self else { return }
            let was = self.connected
            self.connected = ok
            if ok && !was { self.sendPresence(true, force: true) }
        }
        r.onMessage = { [weak self] id, body in self?.receive(id: id, body: body) }
        relay = r
        r.start()
    }

    private func receive(id: String, body: String) {
        guard let rc = crypto, let c = config else { return }
        UserDefaults.standard.set(id, forKey: "since-\(rc.topic)")
        guard let env = rc.open(body), env.from != c.deviceId, !seen.contains(env.id) else { return }
        seen.insert(env.id)
        if !env.name.isEmpty, env.name != peerName { setPeerName(env.name) }
        let age = Date().timeIntervalSince1970 - env.ts

        switch env.kind {
        case .text, .media:
            guard !messages.contains(where: { $0.id == env.id }) else { return }
            var m = ChatMessage(id: env.id, text: env.body, mine: false,
                                date: Date(timeIntervalSince1970: env.ts), status: .received)
            m.ts = env.ts
            m.replyTo = env.replyTo
            if let t = env.ttl, t > 0 {
                let exp = Date(timeIntervalSince1970: env.ts + t)
                guard exp > Date() else { return }
                m.expiresAt = exp
            }
            if let media = env.media {
                m.media = media
                m.mediaState = .downloading
            }
            peerTyping = false
            messages.append(m)
            if messages.count > 1, messages[messages.count - 2].date > m.date {
                messages.sort { $0.date < $1.date }
            }
            save()
            if m.media != nil { download(m.id) }
            if isActive { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
            if age < 120 { markPeerSeen() }
            scheduleRead()

        case .edit:
            guard let t = env.target,
                  let i = messages.firstIndex(where: { $0.id == t && !$0.mine }) else { return }
            messages[i].text = String(env.body.prefix(Self.maxLength))
            messages[i].edited = true
            save()

        case .delete:
            if let t = env.target { removeMessage(t) }

        case .clear:
            clearLocal()
            appendSystem("\(displayPeer) sohbeti temizledi")

        case .ttl:
            let v = Double(env.body) ?? 0
            ttl = v
            UserDefaults.standard.set(v, forKey: "ttl")
            appendSystem(v > 0 ? "\(displayPeer) otomatik silmeyi \(Self.ttlLabel(v)) yaptı"
                               : "\(displayPeer) otomatik silmeyi kapattı")

        case .read:
            let upTo = Double(env.body) ?? 0
            var changed = false
            for i in messages.indices where messages[i].mine && messages[i].status == .sent
                && (messages[i].ts ?? .greatestFiniteMagnitude) <= upTo {
                messages[i].status = .read
                changed = true
            }
            if changed { save() }

        case .presence:
            guard age < 90 else { return }
            if env.body == "on" {
                let was = peerOnline
                markPeerSeen()
                if !was, isActive { sendPresence(true, force: true) }
            } else {
                peerOnline = false
                peerTyping = false
                setLastSeen(Date(timeIntervalSince1970: env.ts))
            }

        case .typing:
            guard age < 10 else { return }
            markPeerSeen()
            peerTyping = true
            typingClear?.cancel()
            typingClear = Task {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                if !Task.isCancelled { peerTyping = false }
            }

        case .screenshot:
            appendSystem("\(displayPeer) ekran görüntüsü aldı")

        case .offer, .answer, .hangup, .reject, .busy:
            call.handle(env)
        }
    }

    private func markPeerSeen() {
        peerOnline = true
        lastPeerPing = Date()
        setLastSeen(Date())
    }

    private func setPeerName(_ n: String) {
        peerName = n
        UserDefaults.standard.set(n, forKey: "peerName")
    }

    private func setStatus(_ id: String, _ s: ChatMessage.Status) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        if messages[i].status == .read, s == .sent { return }
        messages[i].status = s
        save()
    }

    private func setMedia(_ id: String, _ s: MediaState) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[i].mediaState = s
        save()
    }

    private func appendSystem(_ text: String) {
        let now = Date()
        var m = ChatMessage(id: UUID().uuidString, text: text, mine: false, date: now, status: .received)
        m.system = true
        m.ts = now.timeIntervalSince1970
        if ttl > 0 { m.expiresAt = now.addingTimeInterval(ttl) }
        messages.append(m)
        save()
    }

    // MARK: - Şifreli yerel kayıt

    private var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("messages.bin")
    }

    private func loadMessages() {
        guard let enc = try? Data(contentsOf: fileURL),
              let d = LocalVault.open(enc),
              let list = try? JSONDecoder().decode([ChatMessage].self, from: d) else { return }
        let now = Date()
        messages = list.compactMap { m in
            if let e = m.expiresAt, e <= now {
                MediaTools.remove(m.localFile)
                return nil
            }
            var m = m
            if m.status == .sending { m.status = .failed }
            if m.mediaState == .uploading || m.mediaState == .downloading { m.mediaState = .failed }
            return m
        }
    }

    private func save() {
        guard let d = try? JSONEncoder().encode(messages), let enc = LocalVault.seal(d) else { return }
        try? enc.write(to: fileURL, options: [.atomic, .completeFileProtectionUnlessOpen])
        SecureFiles.excludeFromBackup(fileURL)
    }
}
