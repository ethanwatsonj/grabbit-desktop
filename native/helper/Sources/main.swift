import AppKit
import Foundation
import ScreenCaptureKit
import Vision

@main
struct GrabbitHelperMain {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())
        guard let command = args.first else {
            fputs("usage: grabbit-helper <status|frontmost-window|ocr|screenshot|apple-fm> ...\n", stderr)
            exit(2)
        }

        do {
            switch command {
            case "status":
                try printJSON([
                    "version": "0.1.0",
                    "appleFMAvailable": appleFMAvailable()
                ])
            case "frontmost-window":
                try printJSON(frontmostWindow())
            case "ocr":
                guard args.count >= 2 else { throw HelperError.usage }
                let text = try await ocr(path: args[1])
                try printJSON(["text": text])
            case "screenshot":
                if #available(macOS 14.0, *) {
                    try await screenshot(args: Array(args.dropFirst()))
                } else {
                    throw HelperError.captureFailed
                }
            case "apple-fm":
                // Placeholder until FoundationModels wiring is filled in on supported OS versions.
                // Returns null-ish empty suggestion so Electron falls back to Gemini/heuristic.
                try printJSON([:] as [String: String])
            default:
                throw HelperError.unknownCommand(command)
            }
        } catch {
            fputs("error: \(error)\n", stderr)
            exit(1)
        }
    }
}

enum HelperError: Error, CustomStringConvertible {
    case usage
    case unknownCommand(String)
    case captureFailed
    case missingOutput
    case invalidRegion

    var description: String {
        switch self {
        case .usage: return "invalid arguments"
        case .unknownCommand(let c): return "unknown command \(c)"
        case .captureFailed: return "capture failed"
        case .missingOutput: return "missing --out"
        case .invalidRegion: return "invalid region"
        }
    }
}

func printJSON(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    if let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func appleFMAvailable() -> Bool {
    if #available(macOS 26.0, *) {
        // FoundationModels availability is probed lightly; keep false until fully wired.
        return false
    }
    return false
}

func frontmostWindow() -> [String: String] {
    let app = NSWorkspace.shared.frontmostApplication
    var result: [String: String] = [:]
    if let name = app?.localizedName { result["appName"] = name }
    if let bid = app?.bundleIdentifier { result["bundleID"] = bid }

    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    if let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
        let pid = app?.processIdentifier ?? 0
        if let match = info.first(where: { ($0[kCGWindowOwnerPID as String] as? pid_t) == pid }) {
            if let title = match[kCGWindowName as String] as? String {
                result["windowTitle"] = title
            }
        }
    }
    return result
}

func ocr(path: String) async throws -> String {
    let url = URL(fileURLWithPath: path)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

@available(macOS 14.0, *)
func screenshot(args: [String]) async throws {
    var mode = "fullscreen"
    var out: String?
    var x: Double?
    var y: Double?
    var w: Double?
    var h: Double?
    var windowId: UInt32?

    var i = 0
    while i < args.count {
        let a = args[i]
        func next() -> String? {
            i += 1
            return i < args.count ? args[i] : nil
        }
        switch a {
        case "--mode": mode = next() ?? mode
        case "--out": out = next()
        case "--x": x = Double(next() ?? "")
        case "--y": y = Double(next() ?? "")
        case "--w": w = Double(next() ?? "")
        case "--h": h = Double(next() ?? "")
        case "--window-id": windowId = UInt32(next() ?? "")
        default: break
        }
        i += 1
    }

    guard let out else { throw HelperError.missingOutput }

    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first else { throw HelperError.captureFailed }

    let filter: SCContentFilter
    if mode == "window", let windowId, let window = content.windows.first(where: { $0.windowID == windowId }) {
        filter = SCContentFilter(desktopIndependentWindow: window)
    } else {
        filter = SCContentFilter(display: display, excludingWindows: [])
    }

    let config = SCStreamConfiguration()
    if mode == "region", let x, let y, let w, let h, w > 0, h > 0 {
        let scale = NSScreen.main?.backingScaleFactor ?? 2
        config.sourceRect = CGRect(x: x, y: y, width: w, height: h)
        config.width = Int(w * scale)
        config.height = Int(h * scale)
    } else {
        config.width = display.width * 2
        config.height = display.height * 2
    }
    config.showsCursor = false
    config.capturesAudio = false

    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    let reps = NSBitmapImageRep(cgImage: image)
    guard let png = reps.representation(using: .png, properties: [:]) else { throw HelperError.captureFailed }
    try png.write(to: URL(fileURLWithPath: out))
    try printJSON(["ok": true, "path": out])
}
