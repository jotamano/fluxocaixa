#!/usr/bin/env node
// Generates JWT_SECRET + anon/service_role keys for a self-hosted Supabase.
// Run: node supabase/selfhost/scripts/generate-keys.mjs
//
// Copies the standard Supabase scheme: HS256 JWTs with `role` claim of
// "anon" or "service_role", signed by a shared 32+ char secret.

import crypto from "node:crypto";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${signature}`;
}

const secret = crypto.randomBytes(48).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 years — long-lived API key

const anon = sign({ role: "anon", iss: "supabase-selfhost", iat, exp }, secret);
const serviceRole = sign({ role: "service_role", iss: "supabase-selfhost", iat, exp }, secret);

console.log("# --- Paste into .env.selfhost ---");
console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${anon}`);
console.log(`SERVICE_ROLE_KEY=${serviceRole}`);
