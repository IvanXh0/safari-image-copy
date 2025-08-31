//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Ivan Apostolovski on 31.8.25.
//

import SafariServices
import os.log
import AppKit

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = extractMessage(from: request)
        
        guard let messageDict = message as? [String: Any],
              let action = messageDict["action"] as? String else {
            sendEchoResponse(context: context, message: message)
            return
        }
        
        switch action {
        case "copyImageData":
            handleCopyImageData(messageDict: messageDict, context: context)
        case "copyImage":
            handleLegacyCopyImage(messageDict: messageDict, context: context)
        default:
            sendEchoResponse(context: context, message: message)
        }
    }
    
    // MARK: - Message Extraction
    
    private func extractMessage(from request: NSExtensionItem?) -> Any? {
        if #available(iOS 15.0, macOS 11.0, *) {
            return request?.userInfo?[SFExtensionMessageKey]
        } else {
            return request?.userInfo?["message"]
        }
    }
    
    // MARK: - Request Handlers
    
    private func handleCopyImageData(messageDict: [String: Any], context: NSExtensionContext) {
        guard let imageDataBase64 = messageDict["imageData"] as? String,
              let mimeType = messageDict["mimeType"] as? String else {
            sendResponse(context: context, success: false, error: "Missing image data or MIME type")
            return
        }
        
        copyImageDataToClipboard(imageDataBase64: imageDataBase64, mimeType: mimeType) { [weak self] success, error in
            self?.sendResponse(context: context, success: success, error: error)
        }
    }
    
    private func handleLegacyCopyImage(messageDict: [String: Any], context: NSExtensionContext) {
        guard let imageUrl = messageDict["imageUrl"] as? String else {
            sendResponse(context: context, success: false, error: "Missing image URL")
            return
        }
        
        copyImageToClipboard(imageUrl: imageUrl) { [weak self] success, error in
            self?.sendResponse(context: context, success: success, error: error)
        }
    }
    
    // MARK: - Response Helpers
    
    private func sendResponse(context: NSExtensionContext, success: Bool, error: String?) {
        let response = NSExtensionItem()
        let responseData: [String: Any] = [
            "success": success,
            "error": error ?? ""
        ]
        
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: responseData]
        } else {
            response.userInfo = ["message": responseData]
        }
        
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    private func sendEchoResponse(context: NSExtensionContext, message: Any?) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: ["echo": message]]
        } else {
            response.userInfo = ["message": ["echo": message]]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    private func copyImageToClipboard(imageUrl: String, completion: @escaping (Bool, String?) -> Void) {
        // Clean and validate the URL
        let cleanedUrl = imageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard !cleanedUrl.isEmpty else {
            completion(false, "Empty URL provided")
            return
        }
        
        guard let url = URL(string: cleanedUrl) else {
            completion(false, "Invalid URL format")
            return
        }
        
        guard url.scheme == "http" || url.scheme == "https" else {
            completion(false, "Only HTTP and HTTPS URLs are supported")
            return
        }
        
        // Create a custom URLSession with network-friendly configuration
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 60.0
        config.waitsForConnectivity = true
        config.allowsCellularAccess = true
        if #available(macOS 10.15, *) {
            config.allowsExpensiveNetworkAccess = true
        } else {
            // Fallback on earlier versions
        }
        if #available(macOS 10.15, *) {
            config.allowsConstrainedNetworkAccess = true
        } else {
            // Fallback on earlier versions
        }
        
        // Use system DNS and network stack
        config.urlCache = URLCache.shared
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        
        let session = URLSession(configuration: config)
        
        // Create URLRequest with comprehensive headers
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", forHTTPHeaderField: "User-Agent")
        request.setValue("image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
        request.setValue("gzip, deflate, br", forHTTPHeaderField: "Accept-Encoding")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        request.setValue("same-origin", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("image", forHTTPHeaderField: "Sec-Fetch-Dest")
        
        
        session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(false, "Network error: \(error.localizedDescription)")
                    return
                }
                
                if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode != 200 {
                        completion(false, "HTTP error: \(httpResponse.statusCode)")
                        return
                    }
                }
                
                guard let data = data else {
                    completion(false, "No data received")
                    return
                }
                
                guard let image = NSImage(data: data) else {
                    completion(false, "Invalid image data")
                    return
                }
                
                self.writeImageToClipboard(image, completion: completion)
            }
        }.resume()
    }
    
    private func copyImageDataToClipboard(imageDataBase64: String, mimeType: String, completion: @escaping (Bool, String?) -> Void) {
        guard let imageData = Data(base64Encoded: imageDataBase64) else {
            completion(false, "Failed to decode base64 image data")
            return
        }
        
        guard let image = NSImage(data: imageData) else {
            completion(false, "Failed to create NSImage from decoded data")
            return
        }
        
        writeImageToClipboard(image, completion: completion)
    }
    
    // MARK: - Clipboard Helper
    
    private func writeImageToClipboard(_ image: NSImage, completion: @escaping (Bool, String?) -> Void) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        
        let success = pasteboard.writeObjects([image])
        completion(success, success ? nil : "Failed to copy to clipboard")
    }

}
