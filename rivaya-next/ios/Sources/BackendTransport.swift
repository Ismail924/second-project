import Foundation

enum BackendTransport {
    static func request(_ text: String, complete: @escaping (String) -> Void) {
        var id = ""
        func reply(_ status: Int, _ body: String, _ error: Bool = false) {
            let result: [String: Any] = ["requestId":id,"status":status,"body":body,"error":error]
            let encoded = (try? JSONSerialization.data(withJSONObject: result)).flatMap { String(data:$0,encoding:.utf8) } ?? "{}"
            DispatchQueue.main.async { complete(encoded) }
        }
        guard let bytes = text.data(using:.utf8), bytes.count <= 5_000_000,
              let data = try? JSONSerialization.jsonObject(with:bytes) as? [String:Any],
              let requestId = data["requestId"] as? String, requestId.count <= 100 else { return }
        id = requestId
        guard let raw = data["url"] as? String, let url = URL(string:raw), url.scheme == "https",
              url.host == "uerhkthubarwrikjtxul.supabase.co", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              ["/auth/v1/","/rest/v1/","/functions/v1/"].contains(where:{url.path.hasPrefix($0)}),
              let method = data["method"] as? String, ["GET","POST","PUT","PATCH","DELETE"].contains(method) else { reply(0,"{}",true);return }
        var request = URLRequest(url:url,timeoutInterval:15);request.httpMethod=method
        let headers = data["headers"] as? [String:String] ?? [:]
        for (key,value) in headers where ["authorization","apikey","content-type"].contains(key.lowercased()) { request.setValue(value,forHTTPHeaderField:key) }
        if let body=data["body"] as? String { request.httpBody=body.data(using:.utf8) }
        // Ephemeral session: no HTTP cookies or credential persistence.
        let config=URLSessionConfiguration.ephemeral;config.httpCookieStorage=nil;config.urlCache=nil
        let session=URLSession(configuration:config,delegate:NoRedirect(),delegateQueue:nil)
        session.dataTask(with:request) { body,response,error in
            defer { session.finishTasksAndInvalidate() }
            guard error == nil, let response=response as? HTTPURLResponse, response.url?.host == url.host,
                  let body=body, body.count<=5_000_000, let text=String(data:body,encoding:.utf8) else { reply(0,"{}",true);return }
            reply(response.statusCode,text)
        }.resume()
    }
    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping (URLRequest?)->Void){completionHandler(nil)}
    }
}
