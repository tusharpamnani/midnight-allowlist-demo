"use client";

import { useWallet } from "@/contexts/WalletContext";

export default function WalletConnect() {
  const {
    isConnected,
    address,
    walletType,
    walletStatus,
    isConnecting,
    connect,
    disconnect,
  } = useWallet();

  if (walletStatus === "checking")
    return (
      <span className="text-zinc-500 text-xs font-mono animate-pulse">
        Checking wallet...
      </span>
    );

  if (isConnected)
    return (
      <div className="flex items-center gap-3 border border-white/10 px-4 py-2 bg-zinc-900/50">
        <div className="flex flex-col">
          <span className="text-[9px] tracking-[0.2em] font-mono text-zinc-500 uppercase">
            {walletType === "1am" ? "1AM" : "Lace"}
          </span>
          <span className="text-xs font-mono text-zinc-300 truncate max-w-[180px]">
            {address}
          </span>
        </div>
        <button
          onClick={disconnect}
          title="Disconnect"
          className="text-zinc-500 hover:text-red-400 text-xs font-mono ml-2"
        >
          disconnect
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => connect("preprod")}
        disabled={isConnecting}
        className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono tracking-widest uppercase py-2 px-5 transition-all disabled:opacity-40"
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {walletStatus === "not-found" && (
        <p className="text-[10px] font-mono text-zinc-600">
          Install 1AM or Lace wallet extension
        </p>
      )}
    </div>
  );
}
