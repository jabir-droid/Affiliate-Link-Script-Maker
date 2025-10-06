// /lib/kv.js
import { Redis } from "@upstash/redis";

/**
 * Koneksi ke Upstash Redis (REST).
 * Pastikan variabel di Vercel:
 * - AFFILIATE_SCRIPT_KV_REST_API_URL
 * - AFFILIATE_SCRIPT_KV_REST_API_TOKEN
 */
export const redis = new Redis({
  url: process.env.AFFILIATE_SCRIPT_KV_REST_API_URL,
  token: process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN,
});
