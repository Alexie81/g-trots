const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assetNames, existingRelease, publish } = require('../.github/scripts/electron-release.cjs');
const repo = { owner: 'example', repo: 'desktop' }, tag = 'v1.2.97';
const complete = () => ({ id: 12, draft: false, prerelease: false, assets: assetNames(tag).map(name => ({ name, state: 'uploaded', size: 42 })) });
const error = status => Object.assign(new Error(`HTTP ${status}`), { status });
const client = get => ({ rest: { repos: { getReleaseByTag: get } } });

test('complete published release is reused without publishing or reading local assets', async () => {
  const release = complete();
  const github = client(async () => ({ data: release }));
  assert.equal(await existingRelease(github, repo, tag), release);
  assert.deepEqual(await publish({ github, repo, tag, directory: 'does-not-exist' }), { release, created: false });
});
test('only a 404 permits a new release, not authentication/server failures', async () => {
  assert.equal(await existingRelease(client(async () => { throw error(404); }), repo, tag), null);
  for (const status of [401, 403, 500]) await assert.rejects(existingRelease(client(async () => { throw error(status); }), repo, tag), { status });
  assert.throws(() => assetNames('../unsafe'));
});
test('waits for another publisher to complete its draft', async () => {
  let reads = 0, waits = 0;
  const release = complete();
  const github = client(async () => ({ data: ++reads === 1 ? { ...release, draft: true, assets: [] } : release }));
  assert.equal(await existingRelease(github, repo, tag, async () => { waits++; }), release);
  assert.equal(waits, 1);
});
test('incomplete published releases and abandoned drafts remain real errors', async () => {
  await assert.rejects(existingRelease(client(async () => ({ data: { ...complete(), assets: [] } })), repo, tag), /not a complete/);
  await assert.rejects(existingRelease(client(async () => ({ data: { ...complete(), draft: true } })), repo, tag, async () => {}), /still a draft/);
});

function buildFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-release-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const names = assetNames(tag), installer = Buffer.from('installer fixture');
  fs.writeFileSync(path.join(directory, names[0]), installer);
  fs.writeFileSync(path.join(directory, names[1]), 'blockmap fixture');
  fs.writeFileSync(path.join(directory, 'latest.yml'), `version: ${tag.slice(1)}\r\npath: ${names[0]}\r\nsha512: ${crypto.createHash('sha512').update(installer).digest('base64')}\r\n`);
  fs.writeFileSync(path.join(directory, 'builder-debug.yml'), 'must not be published');
  return directory;
}
test('publishes exactly the verified installer, blockmap and manifest before making the release public', async t => {
  const directory = buildFixture(t), calls = [];
  const github = client(async () => { throw error(404); });
  Object.assign(github.rest.repos, {
    createRelease: async input => { assert.equal(input.draft, true); calls.push('draft'); return { data: { id: 12 } }; },
    uploadReleaseAsset: async input => { calls.push(input.name); return { data: { size: input.data.length, digest: 'sha256:' + crypto.createHash('sha256').update(input.data).digest('hex') } }; },
    updateRelease: async input => { assert.equal(input.draft, false); assert.equal(input.make_latest, 'legacy'); calls.push('publish'); return { data: complete() }; },
  });
  assert.equal((await publish({ github, repo, tag, directory })).created, true);
  assert.deepEqual(calls, ['draft', ...assetNames(tag), 'publish']);
});
test('a concurrent release creation is verified and reused, not overwritten', async t => {
  const directory = buildFixture(t); let reads = 0;
  const github = client(async () => { if (++reads === 1) throw error(404); return { data: complete() }; });
  github.rest.repos.createRelease = async () => { throw error(422); };
  assert.equal((await publish({ github, repo, tag, directory })).created, false);
});
test('mismatched manifest fails before creating a release', async t => {
  const directory = buildFixture(t);
  fs.writeFileSync(path.join(directory, 'latest.yml'), 'version: 0.0.1\n');
  const github = client(async () => { throw error(404); });
  await assert.rejects(publish({ github, repo, tag, directory }), /does not match/);
});
test('failed upload verification leaves the release unpublished', async t => {
  const directory = buildFixture(t);
  const github = client(async () => { throw error(404); });
  github.rest.repos.createRelease = async () => ({ data: { id: 12 } });
  github.rest.repos.uploadReleaseAsset = async () => ({ data: { size: 0 } });
  await assert.rejects(publish({ github, repo, tag, directory }), /failed verification/);
});
