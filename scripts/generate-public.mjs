import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const siteDir = resolve(root, "site");
const publicDir = resolve(root, "public");
// VERCEL_PROJECT_PRODUCTION_URL is a bare host and must get a scheme, and the
// stable production host has to win over VERCEL_URL, which is the per-deploy
// preview host and would end up baked into the production manifest.
const fallbackVercelUrl = toHttpsUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? toHttpsUrl(process.env.VERCEL_URL);
const appUrl = (toHttpsUrl(process.env.APP_URL) ?? fallbackVercelUrl ?? "https://example.com").replace(/\/$/, "");

function toHttpsUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0].trim();
  if (!host) return null;
  return `https://${host}`;
}
const isProductionDeploy = process.env.VERCEL_ENV === "production";
const hasSignedAssociation =
  Boolean(process.env.FARCASTER_HEADER) &&
  Boolean(process.env.FARCASTER_PAYLOAD) &&
  Boolean(process.env.FARCASTER_SIGNATURE);

if (isProductionDeploy && appUrl === "https://example.com") {
  console.warn("[miniapp] APP_URL is not set. Using example.com fallback. Set APP_URL in Vercel env.");
}

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(siteDir, publicDir, { recursive: true });

const frameObject = {
  version: "next",
  imageUrl: `${appUrl}/og.svg`,
  button: {
    title: "Open Gamble Battle",
    action: {
      type: "launch_frame",
      name: "Gamble Battle",
      url: appUrl,
      splashImageUrl: `${appUrl}/icon.svg`,
      splashBackgroundColor: "#081428"
    }
  }
};

const indexPath = resolve(publicDir, "index.html");
const currentIndex = await readFile(indexPath, "utf8");
const nextIndex = currentIndex
  .replaceAll("__APP_URL__", appUrl)
  .replaceAll("__FC_FRAME__", escapeHtmlAttribute(JSON.stringify(frameObject)));
await writeFile(indexPath, nextIndex, "utf8");

const manifest = {
  accountAssociation: {
    header:
      process.env.FARCASTER_HEADER ??
      "eyJmaWQiOjI4MTMxMTIsInR5cGUiOiJhdXRoIiwia2V5IjoiMHhlOTMxODFlMEZDNTFhYjQyNTU2QjI5MzdGMjVEOThhNDc3OTI1NzY4In0",
    payload: process.env.FARCASTER_PAYLOAD ?? "eyJkb21haW4iOiJnYW1ibGUtYmF0dGxlLnZlcmNlbC5hcHAifQ",
    signature:
      process.env.FARCASTER_SIGNATURE ??
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEEj2lG2kG3L3saBbPAraVSgJu3T7l-bHhERIhiIjKsROELmvWfJLj0kScpz-qsnvsrAyOUZDK2fwK9VuE0CCKqmHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  },
  miniapp: miniappManifest(),
  frame: miniappManifest()
};

function miniappManifest() {
  return {
    version: "1",
    name: "Gamble Battle",
    iconUrl: `${appUrl}/icon.svg`,
    homeUrl: appUrl,
    imageUrl: `${appUrl}/og.svg`,
    buttonTitle: "Play",
    splashImageUrl: `${appUrl}/icon.svg`,
    splashBackgroundColor: "#081428",
    webhookUrl: process.env.WEBHOOK_URL ?? `${appUrl}/api/webhook`
  };
}

if (isProductionDeploy && !hasSignedAssociation) {
  console.warn("[miniapp] FARCASTER_* env vars are not fully configured. Manifest uses placeholder association fields.");
}

const manifestPath = resolve(publicDir, ".well-known", "farcaster.json");
await mkdir(resolve(publicDir, ".well-known"), { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&#39;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
