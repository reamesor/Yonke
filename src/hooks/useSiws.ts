"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { isSiwsEnabled } from "@/lib/features";

export type SiwsStatus =
  | "disabled"
  | "idle"
  | "challenging"
  | "signing"
  | "verifying"
  | "verified"
  | "error";

type SessionRes = {
  enabled: boolean;
  verified: boolean;
  pubkey: string | null;
};

export function useSiws() {
  const { publicKey, connected, signMessage } = useWallet();
  const enabled = isSiwsEnabled();
  const [status, setStatus] = useState<SiwsStatus>(enabled ? "idle" : "disabled");
  const [verifiedPubkey, setVerifiedPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus("disabled");
      setVerifiedPubkey(null);
      return;
    }
    try {
      const res = await fetch("/api/auth/siws/session", { credentials: "include" });
      const data = (await res.json()) as SessionRes;
      if (data.verified && data.pubkey) {
        setVerifiedPubkey(data.pubkey);
        setStatus("verified");
      } else {
        setVerifiedPubkey(null);
        setStatus("idle");
      }
    } catch {
      setVerifiedPubkey(null);
      setStatus("idle");
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const pk = publicKey?.toBase58() ?? null;
    if (!connected || !pk) {
      if (status === "verified") {
        setStatus("idle");
        setVerifiedPubkey(null);
      }
      return;
    }
    if (verifiedPubkey && verifiedPubkey !== pk) {
      setStatus("idle");
      setVerifiedPubkey(null);
    }
  }, [connected, enabled, publicKey, status, verifiedPubkey]);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!enabled) {
      setError("SIWS is not enabled on this deployment.");
      return false;
    }
    if (!connected || !publicKey) {
      setError("Connect a wallet first.");
      setStatus("error");
      return false;
    }
    if (!signMessage) {
      setError("This wallet does not support message signing.");
      setStatus("error");
      return false;
    }

    setBusy(true);
    setError(null);
    const pubkey = publicKey.toBase58();

    try {
      setStatus("challenging");
      const chalRes = await fetch("/api/auth/siws/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey }),
      });
      const chal = await chalRes.json();
      if (!chalRes.ok) {
        throw new Error(chal.error || chal.message || "Challenge failed");
      }

      setStatus("signing");
      const messageBytes = new TextEncoder().encode(chal.message as string);
      let signature: Uint8Array;
      try {
        signature = await signMessage(messageBytes);
      } catch {
        throw new Error("Signature declined — approve the sign-in message in your wallet.");
      }

      setStatus("verifying");
      const verRes = await fetch("/api/auth/siws/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pubkey,
          nonce: chal.nonce,
          message: chal.message,
          signature: bs58.encode(signature),
        }),
      });
      const ver = await verRes.json();
      if (!verRes.ok) throw new Error(ver.error || "Verification failed");

      setVerifiedPubkey(pubkey);
      setStatus("verified");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SIWS failed";
      setError(msg);
      setStatus("error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [connected, enabled, publicKey, signMessage]);

  const clear = useCallback(async () => {
    try {
      await fetch("/api/auth/siws/session", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    setVerifiedPubkey(null);
    setStatus(enabled ? "idle" : "disabled");
    setError(null);
  }, [enabled]);

  const isVerifiedFor =
    enabled &&
    status === "verified" &&
    !!verifiedPubkey &&
    !!publicKey &&
    verifiedPubkey === publicKey.toBase58();

  return {
    enabled,
    status,
    busy,
    error,
    verifiedPubkey,
    isVerified: isVerifiedFor,
    verify,
    clear,
    refresh,
  };
}
