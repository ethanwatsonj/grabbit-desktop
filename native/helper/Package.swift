// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "grabbit-helper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "grabbit-helper", targets: ["GrabbitHelper"])
    ],
    targets: [
        .executableTarget(
            name: "GrabbitHelper",
            path: "Sources"
        )
    ]
)
