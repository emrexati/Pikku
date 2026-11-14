import SwiftUI
import UIKit
import PhotosUI
import AVKit
import UniformTypeIdentifiers

@MainActor
struct ChatView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var call: CallManager
    @EnvironmentObject var theme: ThemeStore
    @State private var draft = ""
    @State private var showSettings = false
    @State private var replying: ChatMessage?
    @State private var editing: ChatMessage?
    @State private var viewer: ChatMessage?
    @State private var pickerItem: PhotosPickerItem?
    @FocusState private var focused: Bool

    private var title: String { model.peerName.isEmpty ? "Pikku" : model.peerName }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            inputBar
        }
        .background(WallpaperView(index: theme.wallpaperIndex).ignoresSafeArea())
        .overlay(alignment: .top) { banner }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.barBg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { showSettings = true } label: { Image(systemName: "gearshape") }
            }
            ToolbarItem(placement: .principal) { header }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button { call.start(video: true) } label: { Image(systemName: "video") }
                Button { call.start(video: false) } label: { Image(systemName: "phone") }
            }
        }
        .sheet(isPresented: $showSettings) {
            if let c = model.config {
                SettingsView(config: c)
                    .environmentObject(model)
                    .environmentObject(theme)
                    .preferredColorScheme(theme.scheme)
            }
        }
        .fullScreenCover(item: $viewer) { m in
            MediaViewer(m: m)
        }
        .onChange(of: pickerItem) { item in
            guard let item else { return }
            pickerItem = nil
            Task { await handlePick(item) }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Avatar(name: title, size: 34)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(title).font(.headline).lineLimit(1)
                    if model.ttl > 0 {
                        Image(systemName: "timer").font(.caption).foregroundColor(theme.accent)
                    }
                }
                Text(model.peerStatus)
                    .font(.caption)
                    .foregroundColor(model.peerOnline || model.peerTyping ? theme.accent : .secondary)
                    .lineLimit(1)
            }
        }
    }

    private var messageList: some View {
        let byId = Dictionary(model.messages.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 3) {
                    if model.messages.isEmpty { EmptyChat() }
                    ForEach(Array(model.messages.enumerated()), id: \.element.id) { i, m in
                        if i == 0 || !Calendar.current.isDate(m.date, inSameDayAs: model.messages[i - 1].date) {
                            DayChip(date: m.date)
                        }
                        Bubble(m: m,
                               reply: m.replyTo.flatMap { byId[$0] },
                               hasReply: m.replyTo != nil,
                               peerName: model.displayPeer) {
                            tap(m)
                        }
                        .id(m.id)
                        .contextMenu { menu(for: m) }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 10)
            }
            .scrollDismissesKeyboard(.interactively)
            .onAppear { scrollToEnd(proxy, animated: false) }
            .onChange(of: model.messages.last?.id) { _ in scrollToEnd(proxy, animated: true) }
            .onChange(of: focused) { f in
                if f { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { scrollToEnd(proxy, animated: true) } }
            }
        }
    }

    // MARK: - Mesaj eylemleri

    @ViewBuilder
    private func menu(for m: ChatMessage) -> some View {
        if m.system != true {
            Button {
                replying = m
                editing = nil
                focused = true
            } label: { Label("Yanıtla", systemImage: "arrowshape.turn.up.left") }
            if !m.text.isEmpty {
                Button {
                    UIPasteboard.general.string = m.text
                } label: { Label("Kopyala", systemImage: "doc.on.doc") }
            }
            if m.mine && m.media == nil && m.status != .failed {
                Button {
                    editing = m
                    replying = nil
                    draft = m.text
                    focused = true
                } label: { Label("Düzenle", systemImage: "pencil") }
            }
            if m.status == .failed || m.mediaState == .failed {
                Button { model.retry(m) } label: { Label("Tekrar dene", systemImage: "arrow.clockwise") }
            }
        }
        Button(role: .destructive) {
            model.deleteForMe(m)
        } label: { Label("Benden sil", systemImage: "trash") }
        if m.system != true {
            Button(role: .destructive) {
                model.deleteForAll(m)
            } label: { Label("Herkesten sil", systemImage: "trash.slash") }
        }
    }

    private func tap(_ m: ChatMessage) {
        if m.mediaState == .ready, m.localFile != nil {
            viewer = m
        } else if m.status == .failed || m.mediaState == .failed {
            model.retry(m)
        }
    }

    private func handlePick(_ item: PhotosPickerItem) async {
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            if let movie = try? await item.loadTransferable(type: Movie.self) {
                await model.sendVideo(movie.url)
            } else {
                model.toast = "Video alınamadı"
            }
        } else if let data = try? await item.loadTransferable(type: Data.self) {
            model.sendImage(data)
        } else {
            model.toast = "Fotoğraf alınamadı"
        }
    }

    private func send() {
        if let e = editing {
            model.editText(e, to: draft)
            editing = nil
        } else {
            model.sendText(draft, replyTo: replying?.id)
            replying = nil
        }
        draft = ""
    }

    // MARK: - Parçalar

    @ViewBuilder private var banner: some View {
        if let text = model.busy ?? model.toast {
            HStack(spacing: 8) {
                if model.busy != nil { ProgressView().tint(.white) }
                Text(text).font(.footnote).foregroundColor(.white)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Capsule().fill(Color.black.opacity(0.75)))
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onTapGesture { model.toast = nil }
            .task(id: model.toast) {
                guard model.toast != nil else { return }
                try? await Task.sleep(nanoseconds: 3_500_000_000)
                withAnimation { model.toast = nil }
            }
        }
    }

    private var inputBar: some View {
        let empty = draft.trimmed.isEmpty
        return VStack(spacing: 0) {
            if let r = replying {
                ContextBar(icon: "arrowshape.turn.up.left",
                           title: r.mine ? "Kendi mesajına yanıt" : "\(model.displayPeer) yanıtlanıyor",
                           text: r.preview) { replying = nil }
            }
            if let e = editing {
                ContextBar(icon: "pencil", title: "Düzenleniyor", text: e.text) {
                    editing = nil
                    draft = ""
                }
            }
            HStack(alignment: .bottom, spacing: 6) {
                PhotosPicker(selection: $pickerItem, matching: .any(of: [.images, .videos])) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 22))
                        .foregroundColor(.secondary)
                        .frame(width: 38, height: 38)
                }
                .disabled(editing != nil)
                TextField("Mesaj", text: $draft, axis: .vertical)
                    .font(theme.font)
                    .lineLimit(1...6)
                    .focused($focused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Color.fieldBg))
                    .onChange(of: draft) { v in
                        if v.count > AppModel.maxLength { draft = String(v.prefix(AppModel.maxLength)) }
                        if !v.isEmpty { model.userTyping() }
                    }
                Button(action: send) {
                    Image(systemName: editing != nil ? "checkmark.circle.fill" : "arrow.up.circle.fill")
                        .font(.system(size: 36))
                        .foregroundColor(empty ? Color.gray.opacity(0.5) : theme.accent)
                }
                .disabled(empty)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
        }
        .background(Color.barBg.ignoresSafeArea(edges: .bottom))
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy, animated: Bool) {
        guard let id = model.messages.last?.id else { return }
        if animated {
            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(id, anchor: .bottom) }
        } else {
            proxy.scrollTo(id, anchor: .bottom)
        }
    }
}

@MainActor
struct ContextBar: View {
    @EnvironmentObject var theme: ThemeStore
    let icon: String
    let title: String
    let text: String
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundColor(theme.accent).frame(width: 28)
            Rectangle().fill(theme.accent).frame(width: 2, height: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundColor(theme.accent)
                Text(text).font(.subheadline).foregroundColor(.secondary).lineLimit(1)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark").foregroundColor(.secondary).frame(width: 32, height: 32)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }
}

// MARK: - Baloncuk

@MainActor
struct Bubble: View {
    @EnvironmentObject var theme: ThemeStore
    let m: ChatMessage
    let reply: ChatMessage?
    let hasReply: Bool
    let peerName: String
    let onTap: () -> Void

    private static let timeFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "HH:mm"
        return f
    }()

    private var time: String { Self.timeFmt.string(from: m.date) }
    private var textColor: Color { m.mine ? theme.myText : theme.theirText }
    private var metaColor: Color { m.mine ? theme.myMeta : theme.theirMeta }

    var body: some View {
        if m.system == true {
            Text("\(m.text) · \(time)")
                .font(.footnote)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.black.opacity(0.28)))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        } else {
            HStack {
                if m.mine { Spacer(minLength: 56) }
                content
                    .background(RoundedRectangle(cornerRadius: 17).fill(m.mine ? theme.myBubble : theme.theirBubble))
                    .shadow(color: .black.opacity(0.08), radius: 0.5, y: 1)
                    .contentShape(RoundedRectangle(cornerRadius: 17))
                    .onTapGesture(perform: onTap)
                if !m.mine { Spacer(minLength: 56) }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if m.media != nil {
            VStack(alignment: .leading, spacing: 4) {
                if hasReply { quote.padding([.horizontal, .top], 6) }
                MediaThumb(m: m)
                    .overlay(alignment: .bottomTrailing) {
                        meta(color: .white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.45)))
                            .padding(6)
                    }
            }
            .padding(3)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                if hasReply { quote }
                (Text(m.text).font(theme.font).foregroundColor(textColor)
                 + Text("  " + placeholder).font(.caption2).foregroundColor(.clear))
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .bottomTrailing) { meta(color: metaColor).offset(y: 2) }
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
        }
    }

    /// Saat ve işaretler için metnin sonunda boş yer bırakır (Telegram'daki gibi).
    private var placeholder: String {
        var s = time
        if m.edited == true { s = "düzenlendi " + s }
        if m.expiresAt != nil { s = "⏱ " + s }
        if m.mine { s += " ✓✓" }
        return s
    }

    private var quote: some View {
        HStack(spacing: 6) {
            Rectangle().fill(theme.accent).frame(width: 2.5)
            VStack(alignment: .leading, spacing: 1) {
                Text(reply.map { $0.mine ? "Sen" : peerName } ?? "Mesaj")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.accent)
                Text(reply?.preview ?? "Silinmiş mesaj")
                    .font(.caption)
                    .foregroundColor(textColor.opacity(0.8))
                    .lineLimit(1)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 2)
    }

    private func meta(color: Color) -> some View {
        HStack(spacing: 3) {
            if m.expiresAt != nil { Image(systemName: "timer").font(.system(size: 9)) }
            if m.edited == true { Text("düzenlendi").font(.caption2) }
            Text(time).font(.caption2)
            if m.mine { statusIcon }
        }
        .foregroundColor(color)
    }

    @ViewBuilder private var statusIcon: some View {
        switch m.status {
        case .sending:
            Image(systemName: "clock").font(.system(size: 9))
        case .sent:
            Image(systemName: "checkmark").font(.system(size: 9, weight: .bold))
        case .read:
            ZStack {
                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).offset(x: -3)
                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).offset(x: 2)
            }
            .frame(width: 15)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill").font(.system(size: 11)).foregroundColor(.red)
        case .received:
            EmptyView()
        }
    }
}

@MainActor
struct MediaThumb: View {
    let m: ChatMessage

    private var size: CGSize {
        let info = m.media
        let w = info?.w ?? 0, h = info?.h ?? 0
        guard w > 0, h > 0 else { return CGSize(width: 220, height: 220) }
        let ratio = h / w
        var width: Double = 230
        var height = width * ratio
        if height > 300 { height = 300; width = height / ratio }
        return CGSize(width: max(width, 120), height: max(height, 90))
    }

    var body: some View {
        let info = m.media
        ZStack {
            image
            overlay
            if info?.isVideo == true, let d = info?.dur, d > 0 {
                Text(MediaTools.duration(d))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.black.opacity(0.45)))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(6)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder private var image: some View {
        let isVideo = m.media?.isVideo == true
        if m.mediaState == .ready, let file = m.localFile,
           let img = ImageCache.image(isVideo ? file + ".jpg" : file) {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: size.width, height: size.height).clipped()
        } else if let t = m.media?.thumb, let d = Data(base64Encoded: t), let img = UIImage(data: d) {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: size.width, height: size.height).clipped()
                .blur(radius: 10)
        } else {
            Rectangle().fill(Color.gray.opacity(0.35))
        }
    }

    @ViewBuilder private var overlay: some View {
        switch m.mediaState {
        case .uploading, .downloading:
            ProgressView()
                .tint(.white)
                .frame(width: 46, height: 46)
                .background(Circle().fill(Color.black.opacity(0.45)))
        case .failed:
            Image(systemName: m.mine ? "arrow.up" : "arrow.down")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 46, height: 46)
                .background(Circle().fill(Color.black.opacity(0.45)))
        case .expired:
            Text("Süresi doldu")
                .font(.caption.weight(.semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.black.opacity(0.5)))
        case .ready:
            if m.media?.isVideo == true {
                Image(systemName: "play.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.white)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(Color.black.opacity(0.45)))
            }
        case .none:
            EmptyView()
        }
    }
}

// MARK: - Tam ekran görüntüleyici

@MainActor
struct MediaViewer: View {
    let m: ChatMessage
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var scale: CGFloat = 1

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            if let file = m.localFile {
                if m.media?.isVideo == true {
                    VideoPlayer(player: player)
                        .ignoresSafeArea()
                        .onAppear {
                            let p = AVPlayer(url: MediaTools.url(file))
                            player = p
                            p.play()
                        }
                        .onDisappear { player?.pause() }
                } else if let img = UIImage(contentsOfFile: MediaTools.url(file).path) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .gesture(MagnificationGesture()
                            .onChanged { scale = max(1, min($0, 5)) }
                            .onEnded { _ in withAnimation(.spring()) { scale = 1 } })
                }
            }
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.black.opacity(0.4)))
                }
                Spacer()
                if let file = m.localFile {
                    ShareLink(item: MediaTools.url(file)) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 18, weight: .semibold))
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.black.opacity(0.4)))
                    }
                }
            }
            .foregroundColor(.white)
            .padding(.horizontal, 16)
        }
        .statusBarHidden()
    }
}

// MARK: - Küçük parçalar

@MainActor
struct DayChip: View {
    let date: Date
    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "d MMMM"
        return f
    }()

    var body: some View {
        let cal = Calendar.current
        let text = cal.isDateInToday(date) ? "Bugün" : cal.isDateInYesterday(date) ? "Dün" : Self.fmt.string(from: date)
        Text(text)
            .font(.footnote.weight(.medium))
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.black.opacity(0.25)))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
    }
}

@MainActor
struct EmptyChat: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill").font(.title2)
            Text("Henüz mesaj yok").font(.headline)
            Text("Karşı taraf aynı eşleşme koduyla giriş yaptığında mesajlarınız birbirine ulaşır.")
                .font(.footnote)
                .multilineTextAlignment(.center)
        }
        .foregroundColor(.white)
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color.black.opacity(0.25)))
        .padding(.horizontal, 40)
        .padding(.top, 120)
    }
}

@MainActor
struct Avatar: View {
    let name: String
    var size: CGFloat = 40

    var body: some View {
        let initial = name.first.map { String($0).uppercased() } ?? "?"
        Text(initial)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(LinearGradient(colors: [Color(UIColor(hex: 0x72D5FD)), Color(UIColor(hex: 0x2A9EF1))],
                                                     startPoint: .top, endPoint: .bottom)))
    }
}
