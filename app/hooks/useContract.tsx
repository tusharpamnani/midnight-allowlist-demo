"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  getCompiledContract,
  getCompiledContractWithWitnesses,
  getLedgerReader,
  type WitnessArgs,
} from "@/lib/contract";
import {
  MerkleTree,
  hashLeaf,
  normalizeSecret,
  TREE_DEPTH,
} from "@/lib/merkle";
import { createUnprovenDeployTx, submitTxAsync, createUnprovenCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { fromHex } from "@/lib/midnight";

export type ContractState = {
  merkle_root: Uint8Array;
  admin_commitment: Uint8Array;
  used_nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem: Uint8Array): boolean;
  };
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MEMBERS_KEY = "zk-allowlist-members"; // stores secrets in order

type ContractContextType = {
  contractAddress: string | null;
  ledgerState: ContractState | null;
  isLoading: boolean;
  error: string | null;
  txHash: string | null;
  deploy: () => Promise<string | undefined>;
  joinContract: (address: string) => void;
  setup: (adminCommitmentHex: string) => Promise<void>;
  setRoot: (newRootHex: string, adminSecretHex: string) => Promise<void>;
  verifyAndUse: (nullifierHex: string, witnessArgs: WitnessArgs) => Promise<void>;
  refreshState: () => Promise<void>;
  members: string[];
  tree: MerkleTree | null;
  addMember: (secret: string) => Promise<string>;
};

const ContractContext = createContext<ContractContextType | null>(null);

export function ContractProvider({ children }: { children: ReactNode }) {
  const { session } = useWallet();
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [ledgerState, setLedgerState] = useState<ContractState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(MEMBERS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Rebuild the tree (with root) whenever the member list changes.
  const [tree, setTree] = useState<MerkleTree | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = new MerkleTree(TREE_DEPTH);
      for (const secret of members) {
        t.insertLeaf(await hashLeaf(secret));
      }
      if (!cancelled) setTree(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [members]);

  const addMember = useCallback(
    async (secret: string) => {
      const norm = await normalizeSecret(secret);
      if (members.includes(norm)) throw new Error("Member already exists");
      const raw = localStorage.getItem(MEMBERS_KEY);
      const current = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [...current, norm];
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(next));
      setMembers(next);
      return norm;
    },
    [members],
  );

  const refreshState = useCallback(async () => {
    if (!session || !contractAddress) return;
    try {
      const cs = await session.providers.publicDataProvider.queryContractState(
        contractAddress,
      );
      if (cs?.data) {
        const ledger = await getLedgerReader();
        setLedgerState(ledger(cs.data));
      }
    } catch (e) {
      console.error("Failed to read state:", e);
    }
  }, [session, contractAddress]);

  const deploy = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const compiled = getCompiledContract();
      const deployData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        } as any,
        { compiledContract: compiled, args: [] } as any,
      );
      const addr = deployData.public.contractAddress;
      setContractAddress(addr);
      await session.providers.privateStateProvider.setContractAddress(addr);

      const id = await submitTxAsync(session.providers as any, {
        unprovenTx: deployData.private.unprovenTx,
      });
      setTxHash(id);
      return addr;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const joinContract = useCallback(
    (address: string) => {
      setContractAddress(address);
      if (session) {
        session.providers.privateStateProvider.setContractAddress(address);
      }
    },
    [session],
  );

  const setup = useCallback(
    async (adminCommitmentHex: string) => {
      if (!session || !contractAddress) return;
      setIsLoading(true);
      setError(null);
      try {
        const commitment = fromHex(adminCommitmentHex);
        const compiled = getCompiledContract();
        const callData = await createUnprovenCallTx(
          session.providers as any,
          {
            compiledContract: compiled,
            contractAddress,
            circuitId: "setup",
            args: [commitment],
          },
        );
        const id = await submitTxAsync(session.providers as any, {
          unprovenTx: callData.private.unprovenTx,
          circuitId: "setup",
        });
        setTxHash(id);
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const cs =
            await session.providers.publicDataProvider.queryContractState(
              contractAddress,
            );
          if (cs?.data) {
            const ledger = await getLedgerReader();
            const state = ledger(cs.data);
            if (bytesToHex(state.admin_commitment) === adminCommitmentHex) {
              setLedgerState(state);
              return;
            }
          }
        }
        await refreshState();
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [session, contractAddress, refreshState],
  );

  const setRoot = useCallback(
    // adminSecret must be normalized hex (32 bytes = 64 chars)
    async (newRootHex: string, adminSecret: string) => {
      if (!session || !contractAddress) return;
      setIsLoading(true);
      setError(null);
      try {
        const newRoot = fromHex(newRootHex);
        const adminSecretNormalized = await normalizeSecret(adminSecret);
        const compiled = getCompiledContractWithWitnesses({
          adminSecret: adminSecretNormalized,
        });
        const callData = await createUnprovenCallTx(
          session.providers as any,
          {
            compiledContract: compiled,
            contractAddress,
            circuitId: "setRoot",
            args: [newRoot],
          },
        );
        const id = await submitTxAsync(session.providers as any, {
          unprovenTx: callData.private.unprovenTx,
          circuitId: "setRoot",
        });
        setTxHash(id);
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const cs =
            await session.providers.publicDataProvider.queryContractState(
              contractAddress,
            );
          if (cs?.data) {
            const ledger = await getLedgerReader();
            const state = ledger(cs.data);
            if (bytesToHex(state.merkle_root) === newRootHex) {
              setLedgerState(state);
              return;
            }
          }
        }
        await refreshState();
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [session, contractAddress, refreshState],
  );

  const verifyAndUse = useCallback(
    async (nullifierHex: string, witnessArgs: WitnessArgs) => {
      if (!session || !contractAddress) return;
      setIsLoading(true);
      setError(null);
      try {
        const nullifier = fromHex(nullifierHex);
        const compiled = getCompiledContractWithWitnesses(witnessArgs);
        const callData = await createUnprovenCallTx(
          session.providers as any,
          {
            compiledContract: compiled,
            contractAddress,
            circuitId: "verifyAndUse",
            args: [nullifier],
          },
        );
        const id = await submitTxAsync(session.providers as any, {
          unprovenTx: callData.private.unprovenTx,
          circuitId: "verifyAndUse",
        });
        setTxHash(id);
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const cs =
            await session.providers.publicDataProvider.queryContractState(
              contractAddress,
            );
          if (cs?.data) {
            const ledger = await getLedgerReader();
            const state = ledger(cs.data);
            if (state.used_nullifiers.member(nullifier)) {
              setLedgerState(state);
              return;
            }
          }
        }
        await refreshState();
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [session, contractAddress, refreshState],
  );

  const value = useMemo<ContractContextType>(
    () => ({
      contractAddress,
      ledgerState,
      isLoading,
      error,
      txHash,
      deploy,
      joinContract,
      setup,
      setRoot,
      verifyAndUse,
      refreshState,
      members,
      tree,
      addMember,
    }),
    [
      contractAddress,
      ledgerState,
      isLoading,
      error,
      txHash,
      deploy,
      joinContract,
      setup,
      setRoot,
      verifyAndUse,
      refreshState,
      members,
      tree,
      addMember,
    ],
  );

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
}

export function useContract() {
  const ctx = useContext(ContractContext);
  if (!ctx) {
    throw new Error("useContract must be used within ContractProvider");
  }
  return ctx;
}
