import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const siteDir = resolve(root, "site");
const publicDir = resolve(root, "public");
const fallbackVercelUrl =
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.VERCEL_PROJECT_PRODUCTION_URL;
const appUrl = (process.env.APP_URL ?? fallbackVercelUrl ?? "https://example.com").replace(/\/$/, "");
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
  .replace("__FC_FRAME__", escapeHtmlAttribute(JSON.stringify(frameObject)));
await writeFile(indexPath, nextIndex, "utf8");

const manifest = {
  accountAssociation: {
    header: process.env.FARCASTER_HEADER ?? "replace-me",
    payload: process.env.FARCASTER_PAYLOAD ?? "replace-me",
    signature: process.env.FARCASTER_SIGNATURE ?? "replace-me"
  },
  frame: {
    version: "1",
    name: "Gamble Battle",
    iconUrl: `${appUrl}/icon.svg`,
    homeUrl: appUrl,
    imageUrl: `${appUrl}/og.svg`,
    buttonTitle: "Play",
    splashImageUrl: `${appUrl}/icon.svg`,
    splashBackgroundColor: "#081428",
    webhookUrl: process.env.WEBHOOK_URL ?? `${appUrl}/api/webhook`
  }
};

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
