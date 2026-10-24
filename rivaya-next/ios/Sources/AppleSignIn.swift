import AuthenticationServices
import CryptoKit
import Security
import UIKit

// One request at a time. Nonces and Apple tokens never enter persistent web storage.
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var controller: ASAuthorizationController?
    private var nonce: String?
    private var state: String?
    private var completion: ((String) -> Void)?
    private weak var window: UIWindow?
    private var requestID: String?

    func start(_ text: String, window: UIWindow?, completion: @escaping (String) -> Void) {
        guard let bytes = text.data(using: .utf8), bytes.count < 512,
              let body = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let id = body["requestId"] as? String, !id.isEmpty, id.count <= 100 else { return }
        func reject(_ code: String) {
            if let data = try? JSONSerialization.data(withJSONObject: ["requestId": id, "error": code]),
               let value = String(data: data, encoding: .utf8) { completion(value) }
        }
        guard controller == nil else { reject("apple_busy"); return }
        guard let window = window else { reject("apple_unavailable"); return }
        guard let rawNonce = random(), let rawState = random() else { reject("apple_unavailable"); return }
        self.window = window; self.nonce = rawNonce; self.state = rawState
        self.completion = completion; self.requestID = id
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }.joined()
        request.state = rawState
        let controller = ASAuthorizationController(authorizationRequests: [request])
        self.controller = controller
        controller.delegate = self; controller.presentationContextProvider = self
        controller.performRequests()
    }

    private func random() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return Data(bytes).base64EncodedString()
    }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Retained by the app for the lifetime of the active request.
        return window ?? ASPresentationAnchor()
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard self.controller === controller else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == state, let nonce = nonce,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8), !token.isEmpty,
              let codeData = credential.authorizationCode,
              let code = String(data: codeData, encoding: .utf8), !code.isEmpty else {
            finish(["error": "apple_invalid_response"]); return
        }
        finish(["idToken": token, "nonce": nonce, "authorizationCode": code])
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard self.controller === controller else { return }
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        finish(["error": cancelled ? "apple_cancelled" : "apple_failed"])
    }
    private func finish(_ payload: [String: String]) {
        var response = payload; response["requestId"] = requestID
        let callback = completion
        self.controller = nil; nonce = nil; state = nil; requestID = nil; completion = nil; window = nil
        guard let bytes = try? JSONSerialization.data(withJSONObject: response),
              let value = String(data: bytes, encoding: .utf8) else { return }
        callback?(value)
    }
}
