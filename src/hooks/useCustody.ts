"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useSiws } from "@/hooks/useSiws";
import { solToLamports } from "@/lib/solana/lamports";

export type CustodyStatus = {
  enabled: boolean;
  cluster: string;
  housePubkey: string | null;
  faucetUrl: string;
  disabledReason?: string | null;
};

export function useCustody() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const siws = useSiws();

  const [status, setStatus] = useState<CustodyStatus | null>(null);
  const [playLamports, setPlayLamports] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletSol, setWalletSol] = useState<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/custody/status");
      const data = (await res.json()) as CustodyStatus;
      setStatus(data);
      return data;
    } catch {
      setStatus({
        enabled: false,
        cluster: "unknown",
        housePubkey: null,
        faucetUrl: "https://faucet.solana.com/",
      });
      return null;
    }
  }, []);

  const refreshWalletSol = useCallback(async () => {
    if (!publicKey) {
      setWalletSol(null);
      return;
    }
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setWalletSol(lamports / LAMPORTS_PER_SOL);
    } catch {
      setWalletSol(null);
    }
  }, [connection, publicKey]);

  const refreshBalance = useCallback(async () => {
    if (!publicKey || !siws.isVerified) {
      setPlayLamports(null);
      return null;
    }
    try {
      const res = await fetch(
        `/api/custody/balance?pubkey=${encodeURIComponent(publicKey.toBase58())}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setPlayLamports(null);
        return null;
      }
      const data = (await res.json()) as { balanceLamports: number };
      setPlayLamports(data.balanceLamports);
      return data.balanceLamports;
    } catch {
      return null;
    }
  }, [publicKey, siws.isVerified]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    void refreshBalance();
    void refreshWalletSol();
  }, [refreshBalance, refreshWalletSol]);

  const deposit = useCallback(
    async (amountSol: number): Promise<{ ok: true } | { ok: false; error: string }> => {
      setError(null);
      if (!connected || !publicKey || !sendTransaction) {
        return { ok: false, error: "Connect a wallet first." };
      }
      if (!siws.isVerified) {
        return { ok: false, error: "Verify ownership before depositing." };
      }
      const st = status ?? (await refreshStatus());
      if (!st?.enabled || !st.housePubkey) {
        return { ok: false, error: st?.disabledReason || "DEVNET custody is not enabled." };
      }
      if (st.cluster !== "devnet") {
        return { ok: false, error: "Wrong network — Yonke custody is DEVNET only." };
      }

      const lamports = solToLamports(amountSol);
      if (lamports <= 0) return { ok: false, error: "Enter an amount greater than 0." };

      try {
        const house = new PublicKey(st.housePubkey);
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: house,
            lamports,
          }),
        );
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");

        const conf = await fetch("/api/custody/deposit/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: publicKey.toBase58(),
            signature,
            minLamports: lamports,
          }),
        });
        const body = await conf.json();
        if (!conf.ok) {
          const msg = body.error || "Deposit confirmation failed";
          setError(msg);
          return { ok: false, error: msg };
        }
        setPlayLamports(body.balanceLamports);
        void refreshWalletSol();
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Deposit failed";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [
      connected,
      connection,
      publicKey,
      refreshStatus,
      refreshWalletSol,
      sendTransaction,
      siws.isVerified,
      status,
    ],
  );

  const withdraw = useCallback(
    async (amountSol: number): Promise<{ ok: true } | { ok: false; error: string }> => {
      setError(null);
      if (!connected || !publicKey) {
        return { ok: false, error: "Connect a wallet first." };
      }
      if (!siws.isVerified) {
        return { ok: false, error: "Verify ownership before withdrawing." };
      }
      const lamports = solToLamports(amountSol);
      if (lamports <= 0) return { ok: false, error: "Enter an amount greater than 0." };
      try {
        const res = await fetch("/api/custody/withdraw", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: publicKey.toBase58(),
            amountLamports: lamports,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          const msg = body.error || "Withdraw failed";
          setError(msg);
          return { ok: false, error: msg };
        }
        setPlayLamports(body.balanceLamports);
        void refreshWalletSol();
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Withdraw failed";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [connected, publicKey, refreshWalletSol, siws.isVerified],
  );

  const playDebit = useCallback(
    async (amountSol: number) => {
      if (!publicKey || !siws.isVerified) {
        return { ok: false as const, error: "Verified wallet required." };
      }
      const res = await fetch("/api/custody/play", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: publicKey.toBase58(),
          kind: "debit",
          amountSol,
        }),
      });
      const body = await res.json();
      if (!res.ok) return { ok: false as const, error: body.error || "Debit failed" };
      setPlayLamports(body.balanceLamports);
      return { ok: true as const };
    },
    [publicKey, siws.isVerified],
  );

  const playCredit = useCallback(
    async (amountSol: number) => {
      if (!publicKey || !siws.isVerified) {
        return { ok: false as const, error: "Verified wallet required." };
      }
      if (amountSol <= 0) return { ok: true as const };
      const res = await fetch("/api/custody/play", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: publicKey.toBase58(),
          kind: "credit",
          amountSol,
        }),
      });
      const body = await res.json();
      if (!res.ok) return { ok: false as const, error: body.error || "Credit failed" };
      setPlayLamports(body.balanceLamports);
      return { ok: true as const };
    },
    [publicKey, siws.isVerified],
  );

  return {
    status,
    enabled: Boolean(status?.enabled),
    faucetUrl: status?.faucetUrl ?? "https://faucet.solana.com/",
    housePubkey: status?.housePubkey ?? null,
    disabledReason: status?.disabledReason ?? null,
    playLamports,
    playSol: playLamports == null ? null : playLamports / LAMPORTS_PER_SOL,
    walletSol,
    error,
    refreshStatus,
    refreshBalance,
    refreshWalletSol,
    deposit,
    withdraw,
    playDebit,
    playCredit,
  };
}
