Pod::Spec.new do |s|
  s.name         = "EnvoyQrScanner"
  s.version      = "0.1.0"
  s.summary      = "EnvoyMesh native QR scanner (AVFoundation)."
  s.homepage     = "https://example.com/envoymesh"
  s.license      = "MIT"
  s.author       = "EnvoyMesh"
  s.source       = { :path => "." }
  s.source_files = "**/*.{swift,h,m}"
  s.platform     = :ios, "15.0"
  s.swift_version = "5.1"
  s.dependency "Capacitor"
end
