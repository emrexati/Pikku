import Foundation
import CryptoKit
import CommonCrypto
import Security
import UIKit
import UniformTypeIdentifiers

// MARK: - Keychain (yalnızca bu cihazda, yedeklere girmez)

enum Keychain {
    static func set(_ data: Data, for key: String) {
        delete(key)
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sohbet",
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemAdd(q as CFDictionary, nil)
    }

    static func get(_ key: String) -> Data? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sohbet",
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    static func delete(_ key: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sohbet",
            kSecAttrAccount as String: key
        ]
        SecItemDelete(q as CFDictionary)
    }
}

// MARK: - Anahtar türetme

enum KeyDerivation {
    /// Kod tireler/boşluklar olmadan, büyük harfle değerlendirilir.
    static func normalize(_ code: String) -> String {
        code.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    /// PBKDF2-SHA256, 300.000 tur: kaba kuvvet denemelerini çok yavaşlatır.
    static func master(from code: String) -> Data {
        let pw = normalize(code)
        let salt = Array("sohbet-v2-salt-2026".utf8)
        var out = [UInt8](repeating: 0, count: 32)
        _ = CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), pw, pw.utf8.count,
                                 salt, salt.count,
                                 CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 300_000,
                                 &out, out.count)
        return Data(out)
    }
}

// MARK: - Uçtan uca şifreleme

struct RoomCrypto {
    let topic: String
    let mediaTopic: String
    let key: SymmetricKey

    init(master: Data) {
        let ikm = SymmetricKey(data: master)
        key = HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, info: Data("enc".utf8), outputByteCount: 32)
        topic = "sb" + Self.hex(HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, info: Data("topic".utf8), outputByteCount: 20))
        mediaTopic = "sm" + Self.hex(HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, info: Data("media".utf8), outputByteCount: 20))
    }

    private static func hex(_ k: SymmetricKey) -> String {
        k.withUnsafeBytes { Data($0) }.map { String(format: "%02x", $0) }.joined()
    }

    func seal(_ env: Envelope) throws -> String {
        let json = try JSONEncoder().encode(env)
        let packed = try (json as NSData).compressed(using: .zlib) as Data
        return try sealData(packed).base64EncodedString()
    }

    func open(_ text: String) -> Envelope? {
        guard let data = Data(base64Encoded: text.trimmed),
              let plain = try? openData(data),
              let json = try? (plain as NSData).decompressed(using: .zlib) as Data
        else { return nil }
        return try? JSONDecoder().decode(Envelope.self, from: json)
    }

    func sealData(_ d: Data) throws -> Data {
        guard let c = try AES.GCM.seal(d, using: key).combined else { throw CocoaError(.coderInvalidValue) }
        return c
    }

    func openData(_ d: Data) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: d), using: key)
    }
}

// MARK: - Cihazdaki sohbet dosyasının şifrelenmesi

enum LocalVault {
    static let key: SymmetricKey = {
        if let d = Keychain.get("localKey") { return SymmetricKey(data: d) }
        let k = SymmetricKey(size: .bits256)
        Keychain.set(k.withUnsafeBytes { Data($0) }, for: "localKey")
        return k
    }()

    static func seal(_ d: Data) -> Data? { try? AES.GCM.seal(d, using: key).combined }
    static func open(_ d: Data) -> Data? {
        guard let box = try? AES.GCM.SealedBox(combined: d) else { return nil }
        return try? AES.GCM.open(box, using: key)
    }
}

enum SecureFiles {
    static func excludeFromBackup(_ url: URL) {
        var u = url
        var rv = URLResourceValues()
        rv.isExcludedFromBackup = true
        try? u.setResourceValues(rv)
    }

    /// Panoya kopyalanan kod 2 dakika sonra silinir ve diğer cihazlara (Evrensel Pano) geçmez.
    static func copySecret(_ s: String) {
        UIPasteboard.general.setItems([[UTType.plainText.identifier: s]],
                                      options: [.expirationDate: Date().addingTimeInterval(120), .localOnly: true])
    }
}
