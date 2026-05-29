import type { EmpCapability } from "@envoymesh/protocol";

export function resolveEmpSupportedCapabilities(input: {
  socialProxyEnabled?: boolean;
  documentAcquisitionEnabled?: boolean;
  capabilityProviderEnabled?: boolean;
}): EmpCapability[] {
  const caps: EmpCapability[] = [];
  if (input.socialProxyEnabled) caps.push("social-proxy");
  if (input.documentAcquisitionEnabled) caps.push("document-acquisition");
  if (input.capabilityProviderEnabled) caps.push("capability-provider");
  return caps;
}
