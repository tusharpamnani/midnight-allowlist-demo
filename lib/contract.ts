import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { Contract } from "@contract/contract/index.js";

const CONTRACT_NAME = "zk-allowlist";

let _compiledVacant: any = null;

// Vacant-witness compiled contract — used for deploy() and setup() which
// don't invoke witnesses (setup only takes a public commitment arg).
export function getCompiledContract() {
  if (_compiledVacant) return _compiledVacant;
  _compiledVacant = getCompiledContractWithWitnesses({});
  return _compiledVacant;
}

export type WitnessArgs = {
  secret?: string; // normalized hex secret
  context?: string; // raw context string
  siblings?: Uint8Array[]; // exactly 20
  pathIndices?: boolean[]; // exactly 20
  adminSecret?: string; // normalized hex admin secret
};

function pad32(str: string): Uint8Array {
  const buf = new Uint8Array(32);
  const bytes = new TextEncoder().encode(str);
  buf.set(bytes.slice(0, 32));
  return buf;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2) || "00", 16);
  }
  return bytes;
}

// Build a compiled contract with real witnesses for setRoot/verifyAndUse.
export function getCompiledContractWithWitnesses(args: WitnessArgs) {
  const witnesses = {
    getSecret: () => [
      undefined,
      args.secret ? hexToBytes(args.secret) : new Uint8Array(32),
    ],
    getContext: () => [
      undefined,
      args.context ? pad32(args.context) : new Uint8Array(32),
    ],
    getSiblings: () => [
      undefined,
      args.siblings ??
        Array.from({ length: 10 }, () => new Uint8Array(32)),
    ],
    getPathIndices: () => [
      undefined,
      args.pathIndices ?? Array.from({ length: 10 }, () => false),
    ],
    getAdminSecret: () => [
      undefined,
      args.adminSecret ? hexToBytes(args.adminSecret) : new Uint8Array(32),
    ],
  };

  const withWitnesses = CompiledContract.withWitnesses as any;
  const withAssets = CompiledContract.withCompiledFileAssets as any;
  const base = CompiledContract.make(CONTRACT_NAME, Contract) as any;
  return withAssets(
    withWitnesses(base, witnesses),
    `/contract/${CONTRACT_NAME}`,
  );
}

export async function getLedgerReader() {
  const mod = await import("@contract/contract/index.js");
  return mod.ledger;
}
