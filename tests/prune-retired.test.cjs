const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { pruneRetired } = require("../scripts/prune-retired.cjs");
const { build } = require("../scripts/build.cjs");
const root = path.resolve(__dirname, "..");
const retired = ["example-deepseek", "example-openai-compatible-bundle"];

function project(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kiss-retired-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function seed(folder, entry, text = "historical bytes") {
  const file = path.join(folder, entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test("build removes only retired packages after validation and preserves every active historical ZIP", (t) => {
  const folder = project(t), dist = path.join(folder, "dist");
  for (const id of fs.readdirSync(path.join(root, "plugins"))) {
    fs.cpSync(path.join(root, "plugins", id), path.join(folder, "plugins", id), { recursive: true });
    seed(dist, `${id}/0.0.1.zip`, id);
  }
  for (const id of retired) seed(dist, `${id}/1.0.0.zip`);
  seed(dist, "example-unrelated/keep.txt");
  seed(dist, "unrelated.txt");
  // Invalid packages must not trigger cleanup.
  const manifestPath = path.join(folder, "plugins/deepseek/manifest.json");
  const original = fs.readFileSync(manifestPath);
  fs.writeFileSync(manifestPath, "{}");
  assert.throws(() => build(folder));
  for (const id of retired) assert.ok(fs.existsSync(path.join(dist, id)));
  fs.writeFileSync(manifestPath, original);
  build(folder);
  build(folder);
  for (const id of retired) assert.ok(!fs.existsSync(path.join(dist, id)));
  const catalog = JSON.parse(fs.readFileSync(path.join(dist, "catalog.json")));
  assert.deepEqual(catalog.plugins.map((item) => item.id), ["deepseek", "openai-compatible-bundle", "openrouter", "siliconflow"]);
  for (const { id } of catalog.plugins) assert.equal(fs.readFileSync(path.join(dist, id, "0.0.1.zip"), "utf8"), id);
  for (const file of ["example-unrelated/keep.txt", "unrelated.txt"])
    assert.equal(fs.readFileSync(path.join(dist, file), "utf8"), "historical bytes");
});

test("cleanup refuses junctions outside the designated directory before deleting anything", (t) => {
  const folder = project(t), dist = path.join(folder, "dist"), outside = path.join(folder, "outside");
  seed(dist, `${retired[0]}/1.0.0.zip`);
  seed(outside, "keep.txt");
  fs.symlinkSync(outside, path.join(dist, retired[1]), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => pruneRetired(dist), /leaves distribution directory/);
  assert.ok(fs.existsSync(path.join(dist, retired[0], "1.0.0.zip")));
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "historical bytes");
});

test("published worktree records deletions and subsequent copies cannot restore retired packages", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kiss-retired-")), repo = path.join(folder, "repo"), staged = path.join(folder, "dist"), worktree = path.join(folder, ".published");
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  t.after(() => {
    if (fs.existsSync(path.join(worktree, ".git"))) git("worktree", "remove", "--force", worktree);
    fs.rmSync(folder, { recursive: true, force: true });
  });
  for (const id of retired) seed(repo, `${id}/1.0.0.zip`);
  seed(repo, "deepseek/0.0.1.zip");
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Initial distribution");
  git("worktree", "add", "--quiet", "--detach", worktree);
  fs.cpSync(repo, staged, { recursive: true, filter: (file) => path.basename(file) !== ".git" });
  pruneRetired(staged);
  pruneRetired(staged);
  pruneRetired(worktree);
  fs.cpSync(staged, worktree, { recursive: true });
  execFileSync("git", ["add", "."], { cwd: worktree });
  const changed = execFileSync("git", ["diff", "--cached", "--name-status"], { cwd: worktree, encoding: "utf8" });
  for (const id of retired) assert.ok(changed.includes(`D\t${id}/1.0.0.zip`));
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Retire examples"], { cwd: worktree });
  pruneRetired(worktree);
  fs.cpSync(staged, worktree, { recursive: true });
  for (const id of retired) assert.ok(!fs.existsSync(path.join(worktree, id)));
  assert.equal(fs.readFileSync(path.join(worktree, "deepseek/0.0.1.zip"), "utf8"), "historical bytes");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: worktree, encoding: "utf8" }).trim(), "");
});
