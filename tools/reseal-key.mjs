#!/usr/bin/env node
/**
 * reseal-key.mjs —— 更換內建 Agnes AI API 金鑰
 *
 *   node tools/reseal-key.mjs sk-新的金鑰
 *
 * 會用 PBKDF2(210000, SHA-256) + AES-256-GCM 重新封裝金鑰，
 * 並直接改寫 index.html 裡的 VAULT 區塊。明文金鑰不會寫進任何檔案。
 *
 * 若要換部署網域，改 HOSTS 陣列後重跑即可。
 * 若要改片段常數，FRAGS 必須與 index.html 中的 FRAG_A / FRAG_B / FRAG_C 一致。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRAGS = ['Tx9k', 'pR2m', 'Ld7q'];          // 對應 index.html 的 FRAG_A / FRAG_B / FRAG_C
const HOSTS = [
  'ericliao2015.github.io',                       // GitHub Pages 正式網域
  'localhost',                                    // 本機開發
  '127.0.0.1',
  ''                                              // file:// 直接開啟
];

const plain = process.argv[2];
if (!plain || !plain.trim()){
  console.error('用法： node tools/reseal-key.mjs <新的 Agnes API Key>');
  process.exit(1);
}

const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const vault = HOSTS.map(host => {
  const pass = FRAGS.join('') + '|' + host;
  const salt = crypto.randomBytes(16);
  const iv   = crypto.randomBytes(12);
  const key  = crypto.pbkdf2Sync(pass, salt, 210000, 32, 'sha256');
  const c    = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct   = Buffer.concat([c.update(plain.trim(), 'utf8'), c.final()]);
  return {
    h: sha(host).slice(0, 16),
    s: salt.toString('base64'),
    v: iv.toString('base64'),
    d: Buffer.concat([ct, c.getAuthTag()]).toString('base64')
  };
});

const block = 'const VAULT = [\n' + vault.map(e => JSON.stringify(e)).join(',\n') + '\n];';

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const re = /const VAULT = \[[\s\S]*?\n\];/;
if (!re.test(html)){
  console.error('在 index.html 找不到 VAULT 區塊，請手動貼上：\n\n' + block);
  process.exit(1);
}
fs.writeFileSync(htmlPath, html.replace(re, block), 'utf8');

console.log('✓ 已更新 index.html 的 VAULT');
console.log('  授權網域：' + HOSTS.map(h => h || '(file://)').join('、'));
console.log('  金鑰長度：' + plain.trim().length + ' 字元（未寫入任何檔案）');
console.log('\n接著： git add index.html && git commit -m "chore: rotate api key" && git push');
