#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const EXPECTED_EMAIL = "cambridgecircus@gmail.com";
const REDIRECT_URI = "http://localhost:3005/oauth2callback";
const PORT = 3005;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function loadEnvLocal() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) {
    throw new Error(".env.local was not found. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET locally first.");
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
}

function waitForOAuthCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", REDIRECT_URI);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) throw new Error(`Google OAuth returned error: ${error}`);
        if (!code) throw new Error("Google OAuth callback did not include a code.");
        if (state !== expectedState) throw new Error("OAuth state mismatch. Please run the command again.");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!doctype html>
          <html>
            <body style="font-family: system-ui, sans-serif; padding: 2rem;">
              <h1>SWIFT Gmail OAuth complete</h1>
              <p>You can close this tab and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close(() => resolve(code));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(error instanceof Error ? error.message : "OAuth failed");
        server.close(() => reject(error));
      }
    });

    server.on("error", (error) => {
      reject(
        new Error(
          `Could not start OAuth callback server on ${REDIRECT_URI}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    });

    server.listen(PORT, "localhost", () => {
      console.log(`Listening for Google OAuth callback on ${REDIRECT_URI}`);
    });
  });
}

async function exchangeCodeForTokens({ code, clientId, clientSecret }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${body.error_description || body.error || `HTTP ${response.status}`}`);
  }
  if (!body.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Re-run this command and complete consent with cambridgecircus@gmail.com; if it still fails, remove SWIFT's existing Google access grant and try again.",
    );
  }
  if (!body.access_token) throw new Error("Google did not return an access token for verification.");
  return body;
}

async function verifyGmailProfile(accessToken) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gmail profile verification failed: ${body.error?.message || `HTTP ${response.status}`}`);
  }
  return body.emailAddress || "unknown";
}

async function main() {
  loadEnvLocal();
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const state = randomBytes(18).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("login_hint", EXPECTED_EMAIL);
  authUrl.searchParams.set("state", state);

  console.log("Opening Google OAuth consent for SWIFT Gmail access.");
  console.log(`Expected Gmail account: ${EXPECTED_EMAIL}`);
  console.log("");
  console.log(authUrl.toString());
  console.log("");

  const callbackPromise = waitForOAuthCallback(state);
  openBrowser(authUrl.toString());

  const code = await callbackPromise;
  console.log("OAuth callback received. Exchanging code for tokens...");

  const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret });
  const authenticatedEmail = await verifyGmailProfile(tokens.access_token);
  const matchesExpected = authenticatedEmail.toLowerCase() === EXPECTED_EMAIL;

  console.log("");
  console.log("GOOGLE_REFRESH_TOKEN:");
  console.log(tokens.refresh_token);
  console.log("");
  console.log(`Authenticated Gmail account: ${authenticatedEmail}`);
  console.log(`Account match: ${matchesExpected}`);

  if (!matchesExpected) {
    process.exitCode = 1;
    console.error("");
    console.error(
      `Wrong Gmail account connected. Expected ${EXPECTED_EMAIL} but authenticated account is ${authenticatedEmail}. Run the helper again and choose ${EXPECTED_EMAIL}.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
