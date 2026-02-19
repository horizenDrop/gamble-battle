import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const publicDir = resolve(process.cwd(), "public");
const indexPath = resolve(publicDir, "index.html");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gamble Battle</title>
</head>
<body>
  <main>
    <h1>Gamble Battle</h1>
    <p>Build artifact for Vercel static output directory.</p>
  </main>
</body>
</html>
`;

await mkdir(publicDir, { recursive: true });
await writeFile(indexPath, html, "utf8");
