#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const releaseRoot = path.join(projectRoot, 'release', 'pulse');
const gameRoot = path.join(releaseRoot, 'screw-harbor');
const catalogPath = path.join(releaseRoot, 'catalog-entry.json');
const manifestPath = path.join(releaseRoot, 'manifest.json');

// Explicit static-build allowlist. Source maps, dotfiles, configs, and arbitrary extensions stay out.
const allowedExtensions = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.ogg', '.wav', '.mp4', '.webm', '.glb', '.gltf', '.bin', '.wasm', '.txt',
]);
const blockedNames = /(^|\/)(?:\.\.?|\.env[^/]*|[^/]*\.(?:map|pem|key|p12|pfx|sqlite|db))$/i;

async function collect(dir, relative = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.name.startsWith('.') || blockedNames.test(rel)) continue;
    const full = path.join(dir, entry.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) files.push(...await collect(full, rel));
    else if (info.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) files.push({ full, rel });
  }
  return files;
}

try {
  const distStat = await lstat(distRoot);
  if (!distStat.isDirectory() || distStat.isSymbolicLink()) throw new Error('dist 경로가 일반 디렉터리가 아닙니다.');
} catch {
  console.error('오류: dist/가 없습니다. 먼저 `npm run build`를 실행하세요.');
  process.exitCode = 1;
} 

if (process.exitCode !== 1) {
  const files = await collect(distRoot);
  if (!files.some((file) => file.rel === 'index.html')) {
    console.error('오류: dist/index.html이 없거나 허용 목록에서 제외되었습니다.');
    process.exitCode = 1;
  } else if (await exists(gameRoot) || await exists(catalogPath) || await exists(manifestPath)) {
    console.error('오류: release/pulse 출력물이 이미 있습니다. 기존 자료를 덮어쓰지 않고 중단합니다.');
    process.exitCode = 1;
  } else {
    await mkdir(gameRoot, { recursive: true });
    const records = [];
    for (const file of files) {
      const destination = path.join(gameRoot, ...file.rel.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      const contents = await readFile(file.full);
      await copyFile(file.full, destination);
      records.push({ path: file.rel, bytes: contents.byteLength, sha256: createHash('sha256').update(contents).digest('hex') });
    }
    const catalog = {
      id: 'screw-harbor',
      title: 'SCREW HARBOR',
      subtitle: '스크루 하버',
      description: '나사를 뽑아 구조물을 해체하세요.',
      genre: '퍼즐',
      players: '1인',
      controls: '마우스 · 키보드 · 터치',
      href: '/games/screw-harbor/',
      source: 'games/screw-harbor',
      files: records.map((record) => record.path),
      search_terms: ['스크루 하버', '나사 퍼즐', 'screw harbor'],
      leaderboard: false,
      ...(records.some((record) => record.path === 'cover.webp') ? { cover: '/games/screw-harbor/cover.webp' } : {}),
    };
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
    await writeFile(manifestPath, `${JSON.stringify({ id: catalog.id, source: 'dist', files: records }, null, 2)}\n`, { flag: 'wx' });
    console.log(`로컬 패키징 완료: ${records.length}개 빌드 파일 → ${path.relative(projectRoot, gameRoot)}`);
    console.log(`카탈로그 초안: ${path.relative(projectRoot, catalogPath)}`);
    console.log('이 스크립트는 원격 연결, 업로드, 포털/게임 목록 수정을 수행하지 않았습니다.');
  }
}

async function exists(target) {
  try { await lstat(target); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

