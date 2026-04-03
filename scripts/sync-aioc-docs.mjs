import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourceDocsDir = path.join(rootDir, "docs");
const targetDocsDir = path.join(
  rootDir,
  "apps",
  "aioc-docs",
  "src",
  "content",
  "docs",
  "governance",
);

const documents = [
  {
    sourceFile: "RFC-0001-governance-first-runtime.md",
    targetDir: "current",
    slug: "rfc-0001-governance-first-runtime",
    status: "Accepted",
  },
  {
    sourceFile: "RFC-0002-policy-gates-for-tools-and-handoffs.md",
    targetDir: "current",
    slug: "rfc-0002-policy-gates-for-tools-and-handoffs",
    status: "Accepted",
  },
  {
    sourceFile: "RFC-0003-run-record-audit-trail-and-persistence.md",
    targetDir: "current",
    slug: "rfc-0003-run-record-audit-trail-and-persistence",
    status: "Accepted",
  },
  {
    sourceFile: "RFC-0004-policy-outcomes-and-approval-model.md",
    targetDir: "current",
    slug: "rfc-0004-policy-outcomes-and-approval-model",
    status: "Accepted",
  },
  {
    sourceFile: "RFC-0005-suspended-proposals-and-approval-lifecycle.md",
    targetDir: "current",
    slug: "rfc-0005-suspended-proposals-and-approval-lifecycle",
    status: "Draft",
  },
  {
    sourceFile: "PRIVACY-BASELINE.md",
    targetDir: "current",
    slug: "privacy-baseline",
  },
  {
    sourceFile: "ALPHA-CONTRACT.md",
    targetDir: "historical",
    slug: "alpha-contract",
  },
  {
    sourceFile: "BETA-CONTRACT.md",
    targetDir: "historical",
    slug: "beta-contract",
  },
  {
    sourceFile: "BETA-CONTRACT-AUDIT.md",
    targetDir: "historical",
    slug: "beta-contract-audit",
  },
  {
    sourceFile: "P0-TRIAGE.md",
    targetDir: "historical",
    slug: "p0-triage",
  },
  {
    sourceFile: "PRIVACY-ADOPTION.md",
    targetDir: "historical",
    slug: "privacy-adoption",
  },
];

function toTitle(source) {
  const match = source.match(/^#\s+(.*)$/m);
  if (match?.[1]) {
    return match[1].trim();
  }
  return "Untitled Document";
}

function stripTopLevelTitle(source) {
  return source.replace(/^#\s+.*\n+/, "");
}

function toGeneratedMarkdown(entry, title, sourceBody) {
  const noteLines = [
    "> Generated from the repository source of truth.",
    `> Source file: \`/docs/${entry.sourceFile}\`.`,
  ];

  if (entry.status) {
    noteLines.push(`> Status: \`${entry.status}\`.`);
  }

  const body = stripTopLevelTitle(sourceBody).trim();

  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${noteLines.join(
    "\n",
  )}\n\n${body}\n`;
}

async function main() {
  await rm(path.join(targetDocsDir, "current"), { recursive: true, force: true });
  await rm(path.join(targetDocsDir, "historical"), {
    recursive: true,
    force: true,
  });

  for (const entry of documents) {
    const sourcePath = path.join(sourceDocsDir, entry.sourceFile);
    const targetPath = path.join(
      targetDocsDir,
      entry.targetDir,
      `${entry.slug}.md`,
    );

    const source = await readFile(sourcePath, "utf8");
    const title = toTitle(source);
    const generated = toGeneratedMarkdown(entry, title, source);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, generated, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
