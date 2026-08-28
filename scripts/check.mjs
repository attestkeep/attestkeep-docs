// The gate. It answers three questions that a broken docs site always fails:
// does every page have its metadata, does every internal link resolve, and is
// the old brand really gone.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(pub);
const pages = files.filter((f) => f.endsWith(".html"));
const problems = [];

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const rel = file.slice(pub.length);

  for (const [tag, re] of [
    ["title", /<title>[^<]+<\/title>/],
    ["description", /<meta name="description" content="[^"]+"/],
    ["canonical", /<link rel="canonical" href="https:\/\/docs\.attestkeep\.com\/[^"]*"/],
  ]) {
    if (!re.test(html)) problems.push(`${rel}: missing ${tag}`);
  }
  if (/\{\{[a-z]+\}\}/.test(html)) problems.push(`${rel}: unreplaced placeholder`);

  // An internal link that 404s is the fastest way to make documentation look
  // abandoned, and it is entirely preventable here.
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = m[1];
    const target = href.endsWith("/") ? join(pub, href, "index.html") : join(pub, href);
    if (!existsSync(target)) problems.push(`${rel}: dead link ${href}`);
  }
}

// The brand moved. A leftover is not a typo here — it is the old company's
// name on the new company's documentation.
const forbidden = /kapan|portiger/i;
for (const file of files.filter((f) => /\.(html|css|js|xml|txt)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  if (forbidden.test(text)) problems.push(`${file.slice(pub.length)}: old brand reference`);
}

if (problems.length) {
  console.error("check failed:\n" + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`check passed — ${pages.length} pages, links and metadata verified`);
