// Browser-safe Poseidon hashing + Merkle tree for the ZK allowlist.
// Mirrors the Node.ts implementations in ./midnight-allowlist using
// @midnight-ntwrk/compact-runtime persistentHash, but no Node deps.

import * as runtime from "@midnight-ntwrk/compact-runtime";
import {
  bytesToHex,
  hexToBytes,
  sha256,
  textEncoder,
} from "./crypto-utils";

const bytes32Type = new runtime.CompactTypeBytes(32);
const vector2Type = new runtime.CompactTypeVector(2, bytes32Type);
const vector3Type = new runtime.CompactTypeVector(3, bytes32Type);

const DOMAIN_LEAF = "zk-allowlist:leaf:v1";
const DOMAIN_NODE = "zk-allowlist:node:v1";
const DOMAIN_NULLIFIER = "zk-allowlist:nullifier:v1";
const DOMAIN_ADMIN = "zk-allowlist:admin:v1";

function pad32(str: string): Uint8Array {
  const buf = new Uint8Array(32);
  const strBuf = textEncoder.encode(str);
  buf.set(strBuf.slice(0, 32));
  return buf;
}

export async function normalizeSecret(secret: string): Promise<string> {
  if (/^[0-9a-f]{64}$/i.test(secret)) return secret.toLowerCase();
  return bytesToHex(await sha256(textEncoder.encode(secret)));
}

export async function hashLeaf(secretHex: string): Promise<string> {
  const secretBytes = hexToBytes(await normalizeSecret(secretHex));
  const res = runtime.persistentHash(vector2Type, [
    pad32(DOMAIN_LEAF),
    secretBytes,
  ]);
  return bytesToHex(res);
}

export function hashNode(leftHex: string, rightHex: string): string {
  const res = runtime.persistentHash(vector3Type, [
    pad32(DOMAIN_NODE),
    hexToBytes(leftHex),
    hexToBytes(rightHex),
  ]);
  return bytesToHex(res);
}

export async function hashNullifier(
  secretHex: string,
  context: string,
): Promise<string> {
  const res = runtime.persistentHash(vector3Type, [
    pad32(DOMAIN_NULLIFIER),
    hexToBytes(await normalizeSecret(secretHex)),
    pad32(context),
  ]);
  return bytesToHex(res);
}

export async function hashAdminCommitment(secretHex: string): Promise<string> {
  const res = runtime.persistentHash(vector2Type, [
    pad32(DOMAIN_ADMIN),
    hexToBytes(await normalizeSecret(secretHex)),
  ]);
  return bytesToHex(res);
}

export const TREE_DEPTH = 10;

export type MerklePath = {
  siblings: string[];
  pathIndices: number[];
};

// Sparse Merkle tree (browser-safe, in-memory)
export class MerkleTree {
  readonly depth: number;
  private leaves: string[] = [];
  private layers: Map<number, Map<number, string>> = new Map();
  private zeroHashes: string[];

  constructor(depth: number = TREE_DEPTH) {
    this.depth = depth;
    this.zeroHashes = computeZeroHashes(depth);
    for (let i = 0; i <= depth; i++) this.layers.set(i, new Map());
  }

  get leafCount(): number {
    return this.leaves.length;
  }

  get root(): string {
    return this.getNode(this.depth, 0);
  }

  private getNode(level: number, index: number): string {
    return this.layers.get(level)?.get(index) ?? this.zeroHashes[level];
  }

  private setNode(level: number, index: number, hash: string): void {
    let layer = this.layers.get(level);
    if (!layer) {
      layer = new Map();
      this.layers.set(level, layer);
    }
    layer.set(index, hash);
  }

  insertLeaf(leafHash: string): number {
    if (this.leaves.length >= 2 ** this.depth) {
      throw new Error("Tree is full");
    }
    const leafIndex = this.leaves.length;
    this.leaves.push(leafHash);
    this.setNode(0, leafIndex, leafHash);
    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      const parentIndex = Math.floor(currentIndex / 2);
      const left = this.getNode(level, parentIndex * 2);
      const right = this.getNode(level, parentIndex * 2 + 1);
      this.setNode(level + 1, parentIndex, hashNode(left, right));
      currentIndex = parentIndex;
    }
    return leafIndex;
  }

  async addMember(secret: string): Promise<{ leaf: string; index: number }> {
    const leaf = await hashLeaf(secret);
    return { leaf, index: this.insertLeaf(leaf) };
  }

  async findLeafIndex(secret: string): Promise<number> {
    const leaf = await hashLeaf(secret);
    return this.leaves.indexOf(leaf);
  }
  getMerklePath(leafIndex: number): MerklePath {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range`);
    }
    const siblings: string[] = [];
    const pathIndices: number[] = [];
    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      siblings.push(this.getNode(level, siblingIndex));
      currentIndex = Math.floor(currentIndex / 2);
    }
    return { siblings, pathIndices };
  }
}

function computeZeroHashes(depth: number): string[] {
  const zeros: string[] = new Array(depth + 1);
  const res = runtime.persistentHash(vector2Type, [
    pad32(DOMAIN_LEAF),
    new Uint8Array(32),
  ]);
  zeros[0] = bytesToHex(res);
  for (let i = 1; i <= depth; i++) {
    zeros[i] = hashNode(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}
