/**
 * On-chain deposit verification + house-signed withdrawals (devnet only).
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getCustodyConnection,
  getHouseKeypair,
  getHousePublicKey,
  isDevnetCustodyConfigured,
} from "./house";

export async function verifyIncomingDeposit(opts: {
  signature: string;
  fromPubkey: string;
  minLamports: number;
}): Promise<{ ok: true; amountLamports: number } | { ok: false; error: string }> {
  if (!isDevnetCustodyConfigured()) {
    return { ok: false, error: "DEVNET custody is not configured." };
  }
  const house = getHousePublicKey();
  if (!house) return { ok: false, error: "House wallet unavailable." };

  const connection = getCustodyConnection();
  let tx;
  try {
    tx = await connection.getParsedTransaction(opts.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to fetch transaction",
    };
  }

  if (!tx) {
    return { ok: false, error: "Transaction not found or not yet confirmed." };
  }
  if (tx.meta?.err) {
    return { ok: false, error: "On-chain transfer failed." };
  }

  const from = new PublicKey(opts.fromPubkey);
  let credited = 0;

  const instructions = tx.transaction.message.instructions;
  for (const ix of instructions) {
    if (!("parsed" in ix) || !ix.parsed) continue;
    if (ix.program !== "system" || ix.parsed.type !== "transfer") continue;
    const info = ix.parsed.info as {
      source?: string;
      destination?: string;
      lamports?: number;
    };
    if (
      info.source === from.toBase58() &&
      info.destination === house.toBase58() &&
      typeof info.lamports === "number"
    ) {
      credited += info.lamports;
    }
  }

  if (credited <= 0 && tx.meta) {
    const accountKeys = tx.transaction.message.accountKeys.map((k) =>
      typeof k === "string" ? k : k.pubkey.toBase58(),
    );
    const fromIdx = accountKeys.indexOf(from.toBase58());
    const houseIdx = accountKeys.indexOf(house.toBase58());
    if (fromIdx >= 0 && houseIdx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
      const houseDelta =
        (tx.meta.postBalances[houseIdx] ?? 0) -
        (tx.meta.preBalances[houseIdx] ?? 0);
      if (houseDelta > 0) credited = houseDelta;
    }
  }

  if (credited < opts.minLamports) {
    return {
      ok: false,
      error: `Transfer to house not found or too small (got ${credited} lamports).`,
    };
  }

  return { ok: true, amountLamports: credited };
}

export async function sendHouseWithdrawal(opts: {
  toPubkey: string;
  amountLamports: number;
}): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  if (!isDevnetCustodyConfigured()) {
    return { ok: false, error: "DEVNET custody is not configured." };
  }
  const house = getHouseKeypair();
  if (!house) return { ok: false, error: "House wallet unavailable." };

  const amount = Math.floor(opts.amountLamports);
  if (amount <= 0) return { ok: false, error: "Amount must be positive." };

  const connection = getCustodyConnection();
  const to = new PublicKey(opts.toPubkey);

  const houseBal = await connection.getBalance(house.publicKey, "confirmed");
  if (houseBal < amount + 5000) {
    return {
      ok: false,
      error: "House wallet has insufficient DEVNET SOL for this withdrawal.",
    };
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: house.publicKey,
      toPubkey: to,
      lamports: amount,
    }),
  );

  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [house], {
      commitment: "confirmed",
    });
    return { ok: true, signature };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Withdrawal send failed",
    };
  }
}
