// Renders src/pages/*.html into public/ using src/layout.html and src/nav.json.
// No framework and no build step beyond this: documentation that needs a
// toolchain to read is documentation that rots when the toolchain does.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(join(root, "src/layout.html"), "utf8");
const nav = JSON.parse(readFileSync(join(root, "src/nav.json"), "utf8"));

// Every page is served from a directory so its URL has no extension:
// /install/ rather than /install.html. The exception is the index.
const urlOf = (slug) => (slug === "index" ? "/" : `/${slug}/`);
const outOf = (slug) =>
  slug === "index" ? "public/index.html" : slug === "404" ? "public/404.html" : `public/${slug}/index.html`;

// 404 is reached by failing to find something else, so it is not in the
// navigation and must not be treated as an orphan.
const unlisted = new Set(["404"]);

function navHTML(current) {
  return nav.sections
    .map((section) => {
      const items = section.pages
        .map((p) => {
          const here = p.slug === current ? ' aria-current="page"' : "";
          return `      <li><a href="${urlOf(p.slug)}"${here}>${p.title}</a></li>`;
        })
        .join("\n");
      return `    <h2>${section.title}</h2>\n    <ul>\n${items}\n    </ul>`;
    })
    .join("\n");
}

const known = new Set(nav.sections.flatMap((s) => s.pages.map((p) => p.slug)));
const files = readdirSync(join(root, "src/pages")).filter((f) => f.endsWith(".html"));

let count = 0;
for (const file of files) {
  const slug = file.replace(/\.html$/, "");
  if (!known.has(slug) && !unlisted.has(slug)) {
    // A page nobody can navigate to is a page nobody will read. Failing here
    // beats publishing an orphan.
    throw new Error(`${file} is not listed in src/nav.json`);
  }
  const raw = readFileSync(join(root, "src/pages", file), "utf8");
  const match = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!match) throw new Error(`${file} has no <!--meta {...} --> block`);
  const meta = JSON.parse(match[1]);
  const body = raw.slice(match[0].length).trim();

  const page = layout
    .replaceAll("{{title}}", meta.title)
    .replaceAll("{{description}}", meta.description)
    .replaceAll("{{canonical}}", slug === "index" || slug === "404" ? "" : `${slug}/`)
    .replace("{{nav}}", navHTML(slug))
    .replace("{{body}}", body);

  const out = join(root, outOf(slug));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  count++;
}

// Sitemap in nav order, so it reads as a table of contents rather than as
// whatever order the filesystem happened to return.
const urls = nav.sections
  .flatMap((s) => s.pages)
  .map((p) => `  <url><loc>https://docs.attestkeep.com${urlOf(p.slug)}</loc></url>`)
  .join("\n");
writeFileSync(
  join(root, "public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
writeFileSync(
  join(root, "public/robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://docs.attestkeep.com/sitemap.xml\n",
);

console.log(`rendered ${count} pages`);
