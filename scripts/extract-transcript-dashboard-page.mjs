import fs from "node:fs";

const transcript =
  "C:/Users/Admin/.cursor/projects/c-Users-Admin-Desktop-Pro-THAIINVEST-v3-0/agent-transcripts/87596127-bbed-4dc8-a6a3-45427668e8c5/87596127-bbed-4dc8-a6a3-45427668e8c5.jsonl";
const raw = fs.readFileSync(transcript, "utf8");
const lines = raw.split("\n");

console.log("total lines", lines.length);
for (let i = 182; i < 192; i++) {
  const line = lines[i];
  if (!line) continue;
  try {
    JSON.parse(line);
    console.log("parse ok line", i + 1);
  } catch (e) {
    console.log("parse fail line", i + 1, String(e.message).slice(0, 160));
  }
}

let last = null;
for (let i = 0; i < lines.length && i < 1470; i++) {
  const line = lines[i];
  if (!line.includes('"name":"Write"') || !line.includes("app\\\\dashboard\\\\page.tsx")) continue;
  try {
    const o = JSON.parse(line);
    const parts = o.message?.content ?? [];
    for (const p of parts) {
      if (p.type === "tool_use" && p.name === "Write" && p.input?.path?.includes("dashboard\\page.tsx")) {
        const c = p.input.contents;
        if (typeof c === "string" && c.length > 5000) last = { line: i + 1, c };
      }
    }
  } catch {
    /* skip */
  }
}

if (!last) {
  console.error("Write dashboard page.tsx not found");
  process.exit(1);
}

fs.writeFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), last.c, "utf8");
console.log("wrote page.tsx from transcript line", last.line, "chars", last.c.length);
