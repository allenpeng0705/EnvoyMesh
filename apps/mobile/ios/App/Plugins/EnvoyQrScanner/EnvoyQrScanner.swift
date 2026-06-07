import Foundation
import UIKit
import AVFoundation
import Capacitor

/**
 * Native QR scanner for EnvoyMesh pairing URIs.
 *
 * On `startScan` the plugin:
 *  1. Asks for camera permission if it has not been granted yet.
 *  2. Mounts an AVCaptureSession preview view full-screen, below the WebView.
 *  3. Makes the WebView background transparent so the preview is visible.
 *  4. Adds an overlay with a centered reticle and a "Cancel" button so the
 *     user has a way to dismiss the scanner (otherwise they have to wait
 *     for a code to be read or force-quit the app).
 *  5. Resolves the call with `{ hasContent: true, content: <text> }` on the
 *     first QR code read, or rejects with a `cancelled` code on Cancel.
 *  6. On `stopScan` (or on user cancel) tears down the session, removes
 *     the overlay, and restores the WebView background.
 *
 * This is a small, self-contained replacement for the iOS side of
 * @capacitor-community/barcode-scanner — it uses current UIKit APIs
 * (no `UIApplication.shared.windows`) and ships inside the app target so
 * we don't depend on a fragile third-party Pod.
 */
@objc(EnvoyQrScanner)
public class EnvoyQrScanner: CAPPlugin, CAPBridgedPlugin, AVCaptureMetadataOutputObjectsDelegate {

    public let identifier = "EnvoyQrScanner"
    public let jsName = "EnvoyQrScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
    ]

    private var captureSession: AVCaptureSession?
    private var capturePreviewLayer: AVCaptureVideoPreviewLayer?
    private var previewContainer: UIView?
    private var cancelButton: UIButton?
    private var reticleView: UIView?
    private var savedCall: CAPPluginCall?
    private var isScanning: Bool = false
    private var savedWebViewBackgroundColor: UIColor?
    private var savedWebViewIsOpaque: Bool?
    private var savedScrollViewBackgroundColor: UIColor?

    private static let cameraDirectionBack = "back"
    private static let cameraDirectionFront = "front"

    @objc func startScan(_ call: CAPPluginCall) {
        if self.isScanning {
            call.reject("A scan is already in progress")
            return
        }
        self.savedCall = call

        let cameraDirection = call.getString("cameraDirection") ?? Self.cameraDirectionBack

        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            DispatchQueue.main.async { self.beginCapture(cameraDirection: cameraDirection) }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self = self else { return }
                if granted {
                    DispatchQueue.main.async { self.beginCapture(cameraDirection: cameraDirection) }
                } else {
                    self.failWith(code: "permissionDenied", message: "Camera permission denied")
                }
            }
        case .denied, .restricted:
            self.failWith(code: "permissionDenied",
                          message: "Camera permission denied. Enable Camera in Settings → EnvoyMesh.")
        @unknown default:
            self.failWith(code: "permissionUnknown",
                          message: "Camera permission in an unknown state")
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.tearDown()
            call.resolve()
        }
    }

    @objc func checkPermission(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        var result: [String: Any] = [:]
        switch status {
        case .authorized:
            result["granted"] = true
        case .denied:
            result["denied"] = true
        case .restricted:
            result["restricted"] = true
        case .notDetermined:
            result["neverAsked"] = true
        @unknown default:
            result["unknown"] = true
        }
        call.resolve(result)
    }

    // MARK: - Capture

    private func beginCapture(cameraDirection: String) {
        guard let webView = self.bridge?.webView else {
            self.failWith(code: "noWebView", message: "Capacitor WebView not available")
            return
        }
        guard let webViewSuperview = webView.superview else {
            self.failWith(code: "noWebViewSuperview", message: "Capacitor WebView has no superview")
            return
        }

        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .high

        let device: AVCaptureDevice?
        if cameraDirection == Self.cameraDirectionFront {
            device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                ?? AVCaptureDevice.default(for: .video)
        } else {
            device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? AVCaptureDevice.default(for: .video)
        }
        guard let captureDevice = device else {
            self.failWith(code: "noCamera", message: "No camera available on this device")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: captureDevice)
            guard session.canAddInput(input) else {
                self.failWith(code: "cannotAddInput", message: "Failed to attach camera input")
                return
            }
            session.addInput(input)
        } catch {
            self.failWith(code: "inputError",
                          message: "Failed to create camera input: \(error.localizedDescription)")
            return
        }

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            self.failWith(code: "cannotAddOutput", message: "Failed to attach metadata output")
            return
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        guard output.availableMetadataObjectTypes.contains(.qr) else {
            self.failWith(code: "qrNotSupported", message: "QR detection is not supported on this device")
            return
        }
        output.metadataObjectTypes = [.qr]
        session.commitConfiguration()

        // Use the WebView's superview bounds (not UIScreen.main.bounds) so the
        // preview always matches the on-screen area the WebView sees, regardless
        // of orientation, safe area, or split-view multitasking.
        let bounds = webViewSuperview.bounds
        if bounds.width <= 0 || bounds.height <= 0 {
            self.failWith(code: "zeroBounds",
                          message: "Cannot mount preview: superview has zero size (\(bounds))")
            return
        }
        CAPLog.print("EnvoyQrScanner: mounting preview at \(bounds)")

        let container = UIView(frame: bounds)
        container.backgroundColor = .black
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        // resizeAspect shows the entire camera frame (with letterboxing if
        // the aspect ratios differ), so the user can see the whole QR and aim
        // at it. resizeAspectFill crops the edges, which led to tiny previews
        // before.
        preview.videoGravity = .resizeAspect
        preview.frame = bounds
        container.layer.addSublayer(preview)

        // Reticle overlay — gives the user a clear aiming area.
        let reticle = self.makeReticle(in: bounds)
        container.addSubview(reticle)
        self.reticleView = reticle

        // Cancel button at the top of the screen.
        let cancel = self.makeCancelButton(in: bounds)
        container.addSubview(cancel)
        self.cancelButton = cancel

        webViewSuperview.insertSubview(container, belowSubview: webView)
        self.previewContainer = container
        self.capturePreviewLayer = preview
        self.captureSession = session

        self.savedWebViewIsOpaque = webView.isOpaque
        self.savedWebViewBackgroundColor = webView.backgroundColor
        self.savedScrollViewBackgroundColor = webView.scrollView.backgroundColor
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(50)) {
            session.startRunning()
            self.isScanning = true
        }
    }

    private func makeReticle(in bounds: CGRect) -> UIView {
        // A full-screen dimming layer with a cutout in the middle that shows
        // the reticle. The reticle is a separate border-only view.
        let side = min(bounds.width, bounds.height) * 0.7
        let originX = (bounds.width - side) / 2
        let originY = (bounds.height - side) / 2
        let reticleRect = CGRect(x: originX, y: originY, width: side, height: side)

        let host = UIView(frame: bounds)
        host.backgroundColor = .clear
        host.isUserInteractionEnabled = false

        let dim = CAShapeLayer()
        let combined = UIBezierPath(rect: bounds)
        combined.append(UIBezierPath(roundedRect: reticleRect, cornerRadius: 12))
        combined.usesEvenOddFillRule = true
        dim.path = combined.cgPath
        dim.fillColor = UIColor.black.withAlphaComponent(0.4).cgColor
        host.layer.addSublayer(dim)

        let border = CAShapeLayer()
        border.path = UIBezierPath(roundedRect: reticleRect, cornerRadius: 12).cgPath
        border.strokeColor = UIColor.white.withAlphaComponent(0.9).cgColor
        border.fillColor = UIColor.clear.cgColor
        border.lineWidth = 2
        host.layer.addSublayer(border)

        return host
    }

    private func makeCancelButton(in bounds: CGRect) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle("Cancel", for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        button.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        button.layer.cornerRadius = 18
        button.contentEdgeInsets = UIEdgeInsets(top: 10, left: 18, bottom: 10, right: 18)
        button.translatesAutoresizingMaskIntoConstraints = true
        let size = button.intrinsicContentSize
        let topInset: CGFloat = 60 // roughly below the notch / dynamic island
        let rightInset: CGFloat = 16
        button.frame = CGRect(
            x: bounds.width - size.width - rightInset,
            y: topInset,
            width: size.width,
            height: size.height,
        )
        button.autoresizingMask = [.flexibleLeftMargin, .flexibleBottomMargin]
        button.addTarget(self, action: #selector(self.onCancelTapped), for: .touchUpInside)
        return button
    }

    @objc private func onCancelTapped() {
        let call = self.savedCall
        self.savedCall = nil
        self.tearDown()
        call?.reject("Scan cancelled by user", "cancelled")
    }

    public func metadataOutput(_ output: AVCaptureMetadataOutput,
                               didOutput metadataObjects: [AVMetadataObject],
                               from connection: AVCaptureConnection) {
        guard self.isScanning,
              let first = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              first.type == .qr,
              let text = first.stringValue,
              !text.isEmpty else {
            return
        }
        self.isScanning = false
        let call = self.savedCall
        self.savedCall = nil
        CAPLog.print("EnvoyQrScanner: scanned text length=\(text.count)")
        self.tearDown()
        call?.resolve(["hasContent": true, "content": text])
    }

    private func tearDown() {
        if let session = self.captureSession, session.isRunning {
            session.stopRunning()
        }
        self.captureSession = nil
        self.capturePreviewLayer = nil
        if let container = self.previewContainer {
            container.removeFromSuperview()
            self.previewContainer = nil
        }
        self.cancelButton = nil
        self.reticleView = nil
        if let webView = self.bridge?.webView {
            if let opaque = self.savedWebViewIsOpaque { webView.isOpaque = opaque }
            if let color = self.savedWebViewBackgroundColor { webView.backgroundColor = color }
            if let color = self.savedScrollViewBackgroundColor { webView.scrollView.backgroundColor = color }
        }
        self.savedWebViewIsOpaque = nil
        self.savedWebViewBackgroundColor = nil
        self.savedScrollViewBackgroundColor = nil
        self.isScanning = false
    }

    private func failWith(code: String, message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let call = self.savedCall
            self.savedCall = nil
            self.tearDown()
            call?.reject(message, code)
        }
    }
}
