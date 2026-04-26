import { parseEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import all from "it-all";
import { fromString, toString } from "uint8arrays";
import type { Uint8ArrayList } from "uint8arraylist";

export function encodeEnvelope(envelope: EnvoyEnvelope): Uint8Array {
  return fromString(JSON.stringify(envelope));
}

export function decodeEnvelope(input: Uint8Array): EnvoyEnvelope {
  return parseEnvelope(JSON.parse(toString(input)));
}

export async function collectStreamBytes(
  source: AsyncIterable<Uint8Array | Uint8ArrayList>,
): Promise<Uint8Array> {
  const chunks = (await all(source)).map((chunk) =>
    chunk instanceof Uint8Array ? chunk : chunk.subarray(),
  );
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
