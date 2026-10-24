import Foundation
import Security

enum SessionVault {
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "app.rivaya.smart01.auth",
         kSecAttrAccount as String: "session"]
    }
    static func request(_ text: String) -> String {
        var response: [String: Any] = [:]
        do {
            guard let data = text.data(using: .utf8), data.count < 20000,
                  let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = body["requestId"] as? String, id.count <= 100,
                  let operation = body["operation"] as? String else { throw NSError(domain: "vault", code: 1) }
            response["requestId"] = id
            if operation == "write" {
                guard let value = body["value"] as? String, let bytes = value.data(using: .utf8), bytes.count <= 16384,
                      (try JSONSerialization.jsonObject(with: bytes)) is [String: Any] else { throw NSError(domain: "vault", code: 2) }
                let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
                if update == errSecItemNotFound {
                    var insert = query; insert[kSecValueData as String] = bytes
                    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                    guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "vault", code: 3) }
                } else if update != errSecSuccess { throw NSError(domain: "vault", code: 4) }
            } else if operation == "read" {
                var read = query; read[kSecReturnData as String] = true; read[kSecMatchLimit as String] = kSecMatchLimitOne
                var result: CFTypeRef?
                let status = SecItemCopyMatching(read as CFDictionary, &result)
                if status == errSecSuccess, let bytes = result as? Data, let value = String(data: bytes, encoding: .utf8) { response["value"] = value }
                else if status != errSecItemNotFound { throw NSError(domain: "vault", code: 5) }
            } else if operation == "clear" {
                let status = SecItemDelete(query as CFDictionary)
                if status != errSecSuccess && status != errSecItemNotFound { throw NSError(domain: "vault", code: 6) }
            } else { throw NSError(domain: "vault", code: 7) }
        } catch { response["error"] = "secure_storage_failed" }
        return (try? String(data: JSONSerialization.data(withJSONObject: response), encoding: .utf8)) ?? "{}"
    }
}
