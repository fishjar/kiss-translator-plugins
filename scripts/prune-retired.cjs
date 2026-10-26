const fs = require("node:fs");
const path = require("node:path");

const retired = ["example-deepseek", "example-openai-compatible-bundle"];

function pruneRetired(folder) {
  if (!fs.existsSync(folder)) return;
  const root = fs.realpathSync(folder);
  // Check every target before deleting anything. Never follow a junction outside
  // the designated distribution directory.
  const targets = retired.map((id) => path.join(root, id));
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const resolved = fs.realpathSync(target);
    if (!resolved.startsWith(root + path.sep))
      throw new Error("Retired package leaves distribution directory: " + target);
  }
  for (const target of targets) fs.rmSync(target, { recursive: true, force: true });
}

if (require.main === module) {
  if (process.argv.length !== 3) throw new Error("Expected a distribution directory");
  pruneRetired(path.resolve(process.argv[2]));
}
module.exports = { pruneRetired };
