enum NatType {
  unknown,
  none,           // No NAT (public IP)
  fullCone,       // Full cone NAT
  restrictedCone, // Restricted cone NAT
  portRestricted, // Port restricted cone NAT
  symmetric,      // Symmetric NAT
  blocked         // STUN requests are blocked
} 