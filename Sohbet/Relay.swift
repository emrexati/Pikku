import Foundation

enum RelayError: Error, Equatable { case server, tooLarge, expired, badResponse }

/// ntfy.sh (veya kendi ntfy sunucun) üzerinden şifreli veri taşıyan kanal.
/// Mesajlar sunucuda ~12 saat, dosyalar ~3 saat bekletilir.
@MainActor
final class Relay {
    var onMessage: (@MainActor (String, String) -> Void)?
    var onState: (@MainActor (Bool) -> Void)?

    private let server: URL
    private let topic: String
    private var since: String
    private var task: URLSessionWebSocketTask?
    private var stopped = true
    private var retry: Double = 1
    private var lastEvent = Date()
    private var watchdog: Timer?
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    init(server: URL, topic: String, since: String) {
        self.server = server
        self.topic = topic
        self.since = since
    }

    func start() {
        stopped = false
        connect()
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkAlive() }
        }
    }

    func stop() {
        stopped = true
        watchdog?.invalidate()
        watchdog = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    func reconnectNow() {
        guard !stopped else { return }
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        retry = 1
        connect()
    }

    /// cache=false: mesaj sunucuda saklanmaz, yalnızca o an bağlı olana gider (çevrimiçi, yazıyor).
    func publish(_ body: String, cache: Bool = true) async throws {
        var req = URLRequest(url: server.appendingPathComponent(topic))
        req.httpMethod = "POST"
        req.httpBody = Data(body.utf8)
        req.timeoutInterval = 15
        if !cache { req.setValue("no", forHTTPHeaderField: "Cache") }
        let (_, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw RelayError.server
        }
    }

    /// Şifreli dosyayı yükler, indirme adresini döndürür.
    func upload(_ data: Data, topic: String) async throws -> String {
        var req = URLRequest(url: server.appendingPathComponent(topic))
        req.httpMethod = "PUT"
        req.setValue("m.bin", forHTTPHeaderField: "Filename")
        req.timeoutInterval = 180
        let (body, resp) = try await session.upload(for: req, from: data)
        guard let http = resp as? HTTPURLResponse else { throw RelayError.server }
        if http.statusCode == 413 { throw RelayError.tooLarge }
        guard (200..<300).contains(http.statusCode) else { throw RelayError.server }
        guard let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let att = obj["attachment"] as? [String: Any],
              let url = att["url"] as? String else { throw RelayError.badResponse }
        return url
    }

    func download(_ urlString: String) async throws -> Data {
        guard let url = URL(string: urlString) else { throw RelayError.badResponse }
        var req = URLRequest(url: url)
        req.timeoutInterval = 180
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw RelayError.server }
        if http.statusCode == 404 || http.statusCode == 410 { throw RelayError.expired }
        guard (200..<300).contains(http.statusCode) else { throw RelayError.server }
        return data
    }

    // MARK: - İç işleyiş

    private func connect() {
        guard !stopped else { return }
        guard var comps = URLComponents(url: server.appendingPathComponent(topic).appendingPathComponent("ws"),
                                        resolvingAgainstBaseURL: false) else { return }
        comps.scheme = comps.scheme == "http" ? "ws" : "wss"
        comps.queryItems = [URLQueryItem(name: "since", value: since)]
        guard let url = comps.url else { return }

        let t = session.webSocketTask(with: url)
        task = t
        lastEvent = Date()
        t.resume()

        Task { [weak self] in
            do {
                while true {
                    let msg = try await t.receive()
                    guard let self, self.task === t else { return }
                    if case .string(let s) = msg { self.handle(s) }
                }
            } catch {
                guard let self, self.task === t else { return }
                self.onState?(false)
                self.scheduleReconnect()
            }
        }
    }

    private func handle(_ s: String) {
        lastEvent = Date()
        guard let d = s.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let event = obj["event"] as? String else { return }
        if event == "open" || event == "keepalive" {
            retry = 1
            onState?(true)
            return
        }
        guard event == "message",
              let id = obj["id"] as? String,
              let body = obj["message"] as? String else { return }
        since = id
        onState?(true)
        onMessage?(id, body)
    }

    private func scheduleReconnect() {
        task = nil
        let delay = retry
        retry = min(retry * 2, 30)
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !self.stopped, self.task == nil else { return }
            self.connect()
        }
    }

    private func checkAlive() {
        guard !stopped else { return }
        if Date().timeIntervalSince(lastEvent) > 75 {
            onState?(false)
            reconnectNow()
        }
    }
}
