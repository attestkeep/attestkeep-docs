// Local preview: render the site, then serve public/ over http so the docs
// can be read exactly as deployed — extensionless URLs, real image paths,
// the same CSP-shaped asset layout — before anything goes live. Re-renders
// on every request so an edit to a page or a screenshot shows up on refresh.
//
// This is a preview server, not the production one: nginx serves public/ in
// deployment (deploy/nginx.conf). Nothing here ships.

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const port = Number(process.env.PORT ?? 4310);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

function render() {
  execFileSync("node", [join(root, "scripts/render.mjs")], { cwd: root, stdio: "inherit" });
}

// Map a request path to a file the way nginx's extensionless routing does:
// /install/ -> public/install/index.html, / -> public/index.html.
function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = join(pub, p);
  if (existsSync(file) && statSync(file).isFile()) return file;
  const asDir = join(pub, p, "index.html");
  if (existsSync(asDir)) return asDir;
  return null;
}

render();

const server = createServer((req, res) => {
  // Re-render page requests so edits appear on refresh; assets are served as-is.
  const isPage = !extname(req.url.split("?")[0]);
  if (isPage) {
    try {
      render();
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("render failed:\n" + (e?.message ?? e));
      return;
    }
  }
  const file = resolve(req.url);
  if (!file) {
    const nf = join(pub, "404.html");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(existsSync(nf) ? readFileSync(nf) : "404");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`docs preview on http://localhost:${port}  (Ctrl-C to stop)`);
});
