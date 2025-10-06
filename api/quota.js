// /api/quota.js
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Buat koneksi ke database Upstash Redis
const redis = new Redis({
  url: process.env.AFFILIATE_SCRIPT_KV_REST_API_URL,
  token: process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN,
});

export async function GET() {
  try {
    const MAX_GLOBAL_PER_DAY = parseInt(process.env.MAX_GLOBAL_PER_DAY || "1000");
    const ESTIMATED_USERS = parseInt(process.env.ESTIMATED_USERS || "100");

    const currentDate = new Date().toISOString().split("T")[0];
    const usageKey = `daily_usage_${currentDate}`;
    let usage = await redis.get(usageKey);
    if (!usage) usage = 0;

    // Hitung sisa kuota per user
    const remainingGlobal = MAX_GLOBAL_PER_DAY - usage;
    const perUserQuota = Math.floor(remainingGlobal / ESTIMATED_USERS);

    return NextResponse.json({
      success: true,
      date: currentDate,
      usageToday: usage,
      remainingGlobal,
      estimatedUsers: ESTIMATED_USERS,
      quotaPerUser: perUserQuota,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Error fetching quota", error: error.message },
      { status: 500 }
    );
  }
}
