"use client";

import { useState, useEffect } from "react";
import "@/app/confetti.css";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";
import WalletConnect from "@/components/WalletConnect";
import { ContractProvider, useContract } from "@/app/hooks/useContract";
import {
  hashAdminCommitment,
  hashNullifier,
  normalizeSecret,
} from "@/lib/merkle";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const zeroHex32 = "0000000000000000000000000000000000000000000000000000000000000000";

function DeploySection() {
  const { isConnected } = useWallet();
  const {
    contractAddress,
    ledgerState,
    isLoading,
    error,
    txHash,
    deploy,
    joinContract,
    refreshState,
  } = useContract();
  const [joinAddr, setJoinAddr] = useState("");

  if (!isConnected) return null;

  if (contractAddress) {
    return (
      <section className="border border-white/10 p-4 bg-zinc-900/30">
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-3">
          Contract
        </h2>
        <div className="space-y-2 text-xs font-mono">
          <div>
            <span className="text-zinc-500">address: </span>
            <span className="text-zinc-300 break-all">{contractAddress}</span>
          </div>
          <div>
            <span className="text-zinc-500">merkle_root: </span>
            <span className="text-zinc-300 break-all">
              {ledgerState ? bytesToHex(ledgerState.merkle_root) : "loading..."}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">admin_commitment: </span>
            <span className="text-zinc-300 break-all">
              {ledgerState
                ? bytesToHex(ledgerState.admin_commitment)
                : "loading..."}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">nullifiers_used: </span>
            <span className="text-zinc-300">
              {ledgerState
                ? ledgerState.used_nullifiers.size().toString()
                : "0"}
            </span>
          </div>
          {txHash && (
            <div>
              <span className="text-zinc-500">last_tx: </span>
              <span className="text-zinc-300 break-all">{txHash}</span>
            </div>
          )}
          {error && <div className="text-red-400">{error}</div>}
        </div>
        <button
          onClick={refreshState}
          className="mt-3 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 uppercase tracking-widest"
        >
          refresh state
        </button>
      </section>
    );
  }

  return (
    <section className="border border-white/10 p-4 bg-zinc-900/30 space-y-4">
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
        Contract
      </h2>
      <div className="flex gap-2">
        <button
          onClick={() => deploy()}
          disabled={isLoading}
          className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
        >
          {isLoading ? "Deploying..." : "Deploy New"}
        </button>
      </div>
      <div className="text-[10px] font-mono text-zinc-600">or join existing</div>
      <div className="flex gap-2">
        <input
          value={joinAddr}
          onChange={(e) => setJoinAddr(e.target.value)}
          placeholder="contract address (hex)"
          className="flex-1 bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
        />
        <button
          onClick={() => joinContract(joinAddr)}
          disabled={!joinAddr}
          className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
        >
          Join
        </button>
      </div>
      {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
    </section>
  );
}

function MembersSection() {
  const { isConnected } = useWallet();
  const { contractAddress, members, tree, addMember, error } = useContract();
  const [secret, setSecret] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  if (!isConnected || !contractAddress) return null;

  return (
    <section className="border border-white/10 p-4 bg-zinc-900/30 space-y-3">
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
        Members (local)
      </h2>
      <div className="text-[10px] font-mono text-zinc-500">
        Add member secrets locally to build the Merkle tree. Local root:{" "}
        <span className="text-zinc-300 break-all">
          {tree ? tree.root.slice(0, 24) + "..." : "building..."}
        </span>{" "}
        ({members.length} members)
      </div>
      <div className="flex gap-2">
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="member secret"
          className="flex-1 bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
        />
        <button
          onClick={async () => {
            if (!secret) return;
            try {
              const norm = await addMember(secret);
              setAdded(norm);
              setSecret("");
            } catch (e) {
              setAdded(null);
              console.error(e);
            }
          }}
          className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-mono tracking-widest uppercase py-2 px-4"
        >
          Add
        </button>
      </div>
      {added && (
        <div className="text-[10px] font-mono text-zinc-400">
          added: {added.slice(0, 16)}...
        </div>
      )}
      {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
      <div className="max-h-32 overflow-y-auto space-y-1">
        {members.map((m, i) => (
          <div key={m} className="text-[10px] font-mono text-zinc-500">
            [{i}] {m.slice(0, 20)}...
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminSection() {
  const { isConnected } = useWallet();
  const { contractAddress, ledgerState, isLoading, setup, setRoot, tree } =
    useContract();
  const [adminSecret, setAdminSecret] = useState("");
  const [newRoot, setNewRoot] = useState("");

  if (!isConnected || !contractAddress) return null;

  const isAdminSet =
    ledgerState !== null &&
    bytesToHex(ledgerState.admin_commitment) !== zeroHex32;
  const localRoot = tree?.root ?? "";

  return (
    <section className="border border-white/10 p-4 bg-zinc-900/30 space-y-3">
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
        Admin
      </h2>

      {!isAdminSet ? (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-zinc-500">
            Set admin commitment (first-time setup)
          </div>
          <input
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="admin secret (any string or 64-char hex)"
            className="w-full bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
          />
          <button
            onClick={async () => {
              if (!adminSecret) return;
              const commitment = await hashAdminCommitment(adminSecret);
              await setup(commitment);
            }}
            disabled={isLoading || !adminSecret}
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
          >
            {isLoading ? "Setting up..." : "Setup Admin"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-zinc-500">
            Admin set. Update Merkle root to reflect the local member tree.
          </div>
          <input
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="admin secret"
            className="w-full bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
          />
          <input
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
            placeholder="new merkle root (hex)"
            className="w-full bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
          />
          {localRoot && (
            <div className="text-[10px] font-mono text-zinc-500">
              local root: <span className="text-zinc-300 break-all">{localRoot}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setRoot(newRoot, adminSecret)}
              disabled={isLoading || !adminSecret || !newRoot}
              className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
            >
              {isLoading ? "Updating..." : "Set Root (typed)"}
            </button>
            {localRoot && (
              <button
                onClick={() => setRoot(localRoot, adminSecret)}
                disabled={isLoading || !adminSecret}
                className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
              >
                Sync local root
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function VerifySection() {
  const { isConnected } = useWallet();
  const { contractAddress, isLoading, verifyAndUse, tree, members } =
    useContract();
  const [secret, setSecret] = useState("");
  const [context, setContext] = useState("voting_v1");
  const [lastNullifier, setLastNullifier] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!showConfetti) return;
    const t = setTimeout(() => setShowConfetti(false), 2500);
    return () => clearTimeout(t);
  }, [showConfetti]);

  if (!isConnected || !contractAddress) return null;

  const doVerify = async () => {
    if (!secret || !context || !tree) return;
    try {
      const norm = await normalizeSecret(secret);
      const leafIndex = members.indexOf(norm);
      if (leafIndex < 0) {
        console.error("Not a member — add your secret in Members first.");
        return;
      }
      const path = tree.getMerklePath(leafIndex);
      const nullifier = await hashNullifier(norm, context);
      setLastNullifier(nullifier);
      const siblings = path.siblings.map((s) => {
        const raw = s.startsWith("0x") ? s.slice(2) : s;
        const bytes = new Uint8Array(32);
        for (let j = 0; j < 32; j++) {
          bytes[j] = parseInt(raw.slice(j * 2, j * 2 + 2) || "00", 16);
        }
        return bytes;
      });
      const pathIndices = path.pathIndices.map((i) => i === 1);
      await verifyAndUse(nullifier, {
        secret: norm,
        context,
        siblings,
        pathIndices,
      });
      setShowConfetti(true);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {showConfetti && <ConfettiBurst />}
      <section className="border border-white/10 p-4 bg-zinc-900/30 space-y-3">
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
          Verify &amp; Use
        </h2>
        <div className="text-[10px] font-mono text-zinc-500">
          Prove membership and record a unique usage (nullifier).
        </div>
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="your secret"
          className="w-full bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
        />
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="context (e.g. voting_v1)"
          className="w-full bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono px-3 py-2 outline-none focus:border-violet-500"
        />
        <button
          onClick={doVerify}
          disabled={isLoading || !secret || !context || !tree}
          className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono tracking-widest uppercase py-2 px-4 disabled:opacity-40"
        >
          {isLoading ? "Proving..." : "Verify & Use"}
        </button>
        {lastNullifier && (
          <div className="text-[10px] font-mono text-zinc-500 break-all">
            nullifier: {lastNullifier}
          </div>
        )}
      </section>
    </>
  );
}

const CONFETTI_COLORS = [
  "#a855f7", "#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#22d3ee", "#f43f5e",
];

function ConfettiBurst() {
  const [dots] = useState(() =>
    Array.from({ length: 35 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 4 + Math.random() * 6,
      delay: Math.random() * 0.3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      drift: (Math.random() - 0.5) * 80,
    })),
  );
  return (
    <div className="confetti-wrap">
      {dots.map((d) => (
        <div
          key={d.id}
          className="confetti-dot"
          style={{
            left: `calc(${d.left}% + ${d.drift}px)`,
            top: "30%",
            width: d.size,
            height: d.size,
            backgroundColor: d.color,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function AppInner() {
  return (
    <div className="min-h-screen bg-black text-zinc-200 font-mono">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              ZK Allowlist
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-widest uppercase mt-1">
              Privacy-preserving membership on Midnight
            </p>
          </div>
          <WalletConnect />
        </header>

        <div className="h-px bg-white/10" />

        <DeploySection />
        <MembersSection />
        <AdminSection />
        <VerifySection />

        <footer className="text-[10px] text-zinc-700 pt-8">
          preview network &middot; midnight.network
        </footer>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <WalletProvider>
      <ContractProvider>
        <AppInner />
      </ContractProvider>
    </WalletProvider>
  );
}
