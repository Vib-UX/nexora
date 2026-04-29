"use client";

import {
  type FalconMockKeypair,
  randomFalconMockKeypair,
  serializeKeypair,
  deserializeKeypair,
} from "@nexora/wallet-sdk/signers";

const STORAGE_KEY = "nexora.falcon.kp.v1";

export function loadOrCreateFalconKeypair(): FalconMockKeypair {
  if (typeof window === "undefined") {
    return randomFalconMockKeypair();
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      return deserializeKeypair(existing);
    } catch {
      // fall through and regenerate
    }
  }
  const kp = randomFalconMockKeypair();
  window.localStorage.setItem(STORAGE_KEY, serializeKeypair(kp));
  return kp;
}

export function clearFalconKeypair(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
