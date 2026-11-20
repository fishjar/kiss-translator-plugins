const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { basename } = require("node:path");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function publishReleases(packages, { latest }) {
  if (!packages.length) {
    console.log("No plugin versions to publish");
    return;
  }

  const { GITHUB_REPOSITORY: repo, GITHUB_SHA: target } = process.env;
  if (!repo || !/^[a-f0-9]{40}$/.test(target ?? "")) {
    throw new Error("Missing GitHub repository or build commit SHA");
  }

  const endpoint = `repos/${repo}/releases`;
  const api = (path, ...args) => execFileSync("gh", ["api", path, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const gh = (...args) => execFileSync("gh", [...args, "--repo", repo], {
    stdio: "inherit",
  });
  const releases = JSON.parse(api(`${endpoint}?per_page=100`, "--paginate", "--slurp")).flat();

  for (const { tag, file, digest } of packages) {
    const release = releases.find((entry) => entry.tag_name === tag);
    const asset = release?.assets.find((entry) => entry.name === basename(file));
    const localDigest = sha256(readFileSync(file));
    if (digest && localDigest !== digest) {
      throw new Error(`Package SHA-256 differs from the catalog: ${tag}`);
    }

    const incomplete = asset?.state === "starter" && release.draft;
    if (asset && !incomplete) {
      const remoteDigest = asset.digest ?? `sha256:${sha256(api(
        `${endpoint}/assets/${asset.id}`, "-H", "Accept: application/octet-stream",
      ))}`;
      if (asset.state !== "uploaded" || remoteDigest !== `sha256:${localDigest}`) {
        throw new Error(`Release asset SHA-256 mismatch or invalid state: ${tag}/${asset.name}`);
      }
      if (!release.draft) {
        console.log(`Verified release: ${tag}`);
        continue;
      }
    }

    if (!release || release.draft) {
      const commit = release?.target_commitish ?? target;
      if (!/^[a-f0-9]{40}$/.test(commit)) {
        throw new Error(`Draft release target must be a commit SHA: ${tag}`);
      }
      const refs = JSON.parse(api(`repos/${repo}/git/matching-refs/tags/${tag}`));
      const ref = refs.find((entry) => entry.ref === `refs/tags/${tag}`);
      if (ref && ref.object.sha !== commit) {
        throw new Error(`Existing tag does not point to the release commit: ${tag}`);
      }
    }
    if (!release) {
      gh("release", "create", tag, "--draft", "--target", target,
        "--title", tag, "--notes", `KISS Translator plugin package: ${basename(file)}`);
    }
    if (incomplete) api(`${endpoint}/assets/${asset.id}`, "--method", "DELETE");
    if (!asset || incomplete) gh("release", "upload", tag, file);
    if (!release || release.draft) {
      gh("release", "edit", tag, "--draft=false", `--latest=${latest}`);
    }
    console.log(`Synchronized release: ${tag}`);
  }
}

module.exports = { publishReleases };
