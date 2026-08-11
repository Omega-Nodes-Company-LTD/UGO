import { readFileSync, writeFileSync } from "node:fs";
const shell = readFileSync("shell.html", "utf8");
const js = readFileSync("bundle.js", "utf8").replaceAll("</script", "<\\/script");
writeFileSync("preview.html", `${shell}\n<script>\n${js}\n</script>\n`);
console.log("preview.html", (readFileSync("preview.html").length / 1024).toFixed(0) + " kB");
