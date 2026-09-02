// ─── 7. Determinism & Consistency ────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier, hashNode, computeZeroHashes } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import { makeTree, makeProofInMemory } from './helpers.js';

describe('Determinism & Consistency', () => {
  it('hashLeaf is deterministic (1000 calls)', () => {
    const expected = hashLeaf('test_secret');
    for (let i = 0; i < 1000; i++) {
      expect(hashLeaf('test_secret')).toBe(expected);
    }
  });

  it('hashNullifier is deterministic (1000 calls)', () => {
    const expected = hashNullifier('secret', 'context');
    for (let i = 0; i < 1000; i++) {
      expect(hashNullifier('secret', 'context')).toBe(expected);
    }
  });

  it('hashNode is deterministic', () => {
    const a = hashLeaf('a');
    const b = hashLeaf('b');
    const expected = hashNode(a, b);
    for (let i = 0; i < 1000; i++) {
      expect(hashNode(a, b)).toBe(expected);
    }
  });

  it('computeZeroHashes is deterministic', () => {
    expect(computeZeroHashes(10)).toEqual(computeZeroHashes(10));
  });

  it('same secrets same order → same root (10x)', () => {
    const secrets = ['a', 'b', 'c', 'd', 'e'];
    const expected = makeTree(8, secrets).root;
    for (let i = 0; i < 10; i++) {
      expect(makeTree(8, secrets).root).toBe(expected);
    }
  });

  it('different insertion order → different root', () => {
    expect(makeTree(8, ['a', 'b', 'c']).root).not.toBe(makeTree(8, ['c', 'b', 'a']).root);
  });

  it('same tree+secret+context → same proof public inputs (50x)', () => {
    const tree = makeTree(8, ['alice', 'bob']);
    const expected = makeProofInMemory(tree, 'alice', 'ctx');
    for (let i = 0; i < 50; i++) {
      const p = makeProofInMemory(tree, 'alice', 'ctx');
      expect(p.publicInputs).toEqual(expected.publicInputs);
    }
  });

  it('verification stable across 100 runs', () => {
    const tree = makeTree(8, ['alice']);
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    for (let i = 0; i < 100; i++) {
      expect(verifyProof(proof).valid).toBe(true);
    }
  });

  it('toJSON → fromJSON round-trip preserves root', () => {
    const tree = makeTree(8, ['x', 'y', 'z']);
    const restored = MerkleTree.fromJSON(tree.toJSON());
    expect(restored.root).toBe(tree.root);
    expect(restored.leafCount).toBe(tree.leafCount);
  });

  // Snapshot regression anchors
  it('hashLeaf("alice") snapshot', () => {
    expect(hashLeaf('alice')).toBe('c9fd090a9bf3194739695283582d2936bf90dd192d68b421656e461100744d5a');
  });

  it('hashLeaf("bob") snapshot', () => {
    expect(hashLeaf('bob')).toBe('b29f6d6da77210719908b09b2c22716c61fad2d9e55c3ea62e491a0dc8ec00d7');
  });

  it('hashNullifier("alice","mint_v1") snapshot', () => {
    expect(hashNullifier('alice', 'mint_v1')).toBe('f2ab810c83a1388563c539df9b5069063c1e25a0c5e8b87ddfde04c8f578326a');
  });

  it('empty tree root at depth 8 snapshot', () => {
    expect(new MerkleTree(8).root).toBe('77ed676bb9732b08bfcf63b86f09383289c650c7230b3527f7a6cd18aefa6356');
  });
});
