const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function assetNames(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Expected a stable desktop tag: vMAJOR.MINOR.PATCH');
  return [`GTrotsSetup-${tag.slice(1)}.exe`, `GTrotsSetup-${tag.slice(1)}.exe.blockmap`, 'latest.yml'];
}

async function getRelease(github, repo, tag) {
  try { return (await github.rest.repos.getReleaseByTag({ ...repo, tag })).data; }
  catch (error) { if (error.status === 404) return null; throw error; }
}

// A local publication can be uploading its assets when creating the tag starts CI.
// Wait for it to finish; never overwrite that publisher's installer or manifest.
async function existingRelease(github, repo, tag, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const names = assetNames(tag);
  for (let attempt = 0; attempt < 13; attempt++) {
    const release = await getRelease(github, repo, tag);
    if (!release) return null;
    const complete = names.every(name => release.assets?.some(asset => asset.name === name && asset.state === 'uploaded' && asset.size > 0));
    if (!release.draft) {
      if (!complete || release.prerelease) throw new Error(`Release ${tag} exists but is not a complete stable Windows release. Its files were not changed.`);
      return release;
    }
    if (attempt === 12) throw new Error(`Release ${tag} is still a draft. Finish the existing publication before retrying.`);
    await sleep(5000);
  }
}

async function publish({ github, repo, tag, directory, sleep }) {
  const names = assetNames(tag);
  let release = await existingRelease(github, repo, tag, sleep);
  if (release) return { release, created: false };
  const files = names.map(name => ({ name, data: fs.readFileSync(path.join(directory, name)) }));
  if (files.some(file => !file.data.length)) throw new Error('Empty Windows release asset');
  const manifest = files[2].data.toString('utf8').replace(/\r\n/g, '\n');
  const expectedHash = crypto.createHash('sha512').update(files[0].data).digest('base64');
  if (!manifest.includes(`version: ${tag.slice(1)}\n`) || !manifest.includes(`path: ${names[0]}\n`) || !manifest.includes(`sha512: ${expectedHash}`)) {
    throw new Error('latest.yml does not match the requested version and installer');
  }
  try {
    release = (await github.rest.repos.createRelease({ ...repo, tag_name: tag, name: `G-Trots Desktop ${tag}`, draft: true, generate_release_notes: true })).data;
  } catch (error) {
    if (error.status !== 422) throw error;
    release = await existingRelease(github, repo, tag, sleep);
    if (!release) throw error;
    return { release, created: false };
  }
  for (const file of files) {
    const { data: asset } = await github.rest.repos.uploadReleaseAsset({ ...repo, release_id: release.id, name: file.name, data: file.data });
    const digest = 'sha256:' + crypto.createHash('sha256').update(file.data).digest('hex');
    if (asset.size !== file.data.length || (asset.digest && asset.digest !== digest)) throw new Error(`Uploaded asset failed verification: ${file.name}`);
  }
  release = (await github.rest.repos.updateRelease({ ...repo, release_id: release.id, draft: false, make_latest: 'legacy' })).data;
  return { release, created: true };
}

module.exports = { assetNames, existingRelease, publish };
