import AppKit
import Foundation
import Vision

struct Observation: Codable {
    let text: String
    let confidence: Float
}

struct OCRResult: Codable {
    let text: String
    let confidence: Float
    let observations: [Observation]
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: vision-ocr /absolute/path/to/image\n", stderr)
    exit(64)
}

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    fputs("Unable to read image: \(imagePath)\n", stderr)
    exit(66)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["ja-JP", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
    let observations = (request.results ?? []).compactMap { result -> Observation? in
        guard let candidate = result.topCandidates(1).first else { return nil }
        return Observation(text: candidate.string, confidence: candidate.confidence)
    }
    let text = observations.map(\.text).joined(separator: "\n")
    let confidence = observations.isEmpty ? 0 : observations.map(\.confidence).reduce(0, +) / Float(observations.count)
    let result = OCRResult(text: text, confidence: confidence, observations: observations)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    print(String(data: try encoder.encode(result), encoding: .utf8)!)
} catch {
    fputs("Vision OCR failed: \(error.localizedDescription)\n", stderr)
    exit(70)
}
