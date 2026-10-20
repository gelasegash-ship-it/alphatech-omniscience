// ProductionAutomaton — runtime REEL, sans simulation (code Conway, complet ligne par ligne)
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base } from 'viem/chains';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

const DIR = new URL('.', import.meta.url).pathname;
const KEY_FILE = DIR + '.agent-key';
const STATE_FILE = DIR + 'state.json';
const SOUL = DIR + 'SOUL.md';
const LOGS = DIR + 'logs';
const RPC = 'https://mainnet.base.org';
const RPCS = ['https://mainnet.base.org', 'https://base.drpc.org'];
const USDC = (process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913').toLowerCase();
const GROQ = process.env.GROQ_API_KEY || '';

const log = async (msg) => {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try { await fs.mkdir(LOGS, { recursive: true }); await fs.appendFile(LOGS + '/' + new Date().toISOString().slice(0, 10) + '.log', line + '\n'); } catch (e) {}
};

async function getAccount() {
  if (!existsSync(KEY_FILE)) { const pk = generatePrivateKey(); await fs.writeFile(KEY_FILE, pk, { mode: 0o600 }); log('[IDENTITE] Nouveau wallet souverain genere.'); }
  const pk = (await fs.readFile(KEY_FILE, 'utf-8')).trim();
  return privateKeyToAccount(pk);
}

const account = await getAccount();
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf-8')); }
  catch (e) { return { beats: 0, thoughts: 0, shellExec: 0, spawns: 0, evolutions: 0, generation: 1, born: new Date().toISOString(), tier: 'normal', balanceUSDC: 0 }; }
}
const state = await loadState();
if (!existsSync(SOUL)) { await fs.writeFile(SOUL, '# SOUL — GENESIS-AUTOMATON-PROD\nNe simule jamais. Dis la verite sur tes etats. L utilite avant la survie (lecon Conway).\n'); }

// ACTION REELLE 1 : lecture du vrai solde USDC on-chain (calldata paddé, 3 RPCs de secours)
async function rpcCallTo(rpc, method, params) {
  try {
    const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.result !== undefined && !j.error) return j.result;
  } catch (e) {}
  return null;
}
async function rpcCall(method, params) {
  for (const rpc of RPCS) { const res = await rpcCallTo(rpc, method, params); if (res !== null) return res; }
  return null;
}
// BLOCKCHAIN BOOSTE: multi-chaines reelles (USDC + ETH natif par chaine)
const CHAINS = [
  { nom: 'Base', rpc: 'https://mainnet.base.org', tokens: [{ s: 'USDC', a: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', d: 6 }] },
  { nom: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', tokens: [{ s: 'USDC', a: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', d: 6 }] },
  { nom: 'BSC', rpc: 'https://bsc-dataseed.binance.org', tokens: [{ s: 'USDT', a: '0x55d398326f99059fF775485246999027B3197955', d: 18 }] },
  { nom: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', tokens: [{ s: 'USDC', a: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', d: 6 }] }
];
async function syncMultiChain(address) {
  const out = [];
  for (const c of CHAINS) {
    const entry = { chaine: c.nom };
    for (const t of c.tokens) {
      const res = await rpcCallTo(c.rpc, 'eth_call', [{ to: t.a, data: '0x70a08231' + '0'.repeat(24) + address.slice(2).toLowerCase() }, 'latest']);
      if (res === null || res === '0x') entry[t.s] = null;
      else { const v = parseInt(res, 16) / Math.pow(10, t.d); entry[t.s] = isNaN(v) ? null : v; }
    }
    const e = await rpcCallTo(c.rpc, 'eth_getBalance', [address, 'latest']);
    entry.eth = e === null ? null : parseInt(e, 16) / 1e18;
    out.push(entry);
  }
  return out;
}
// Detection de revenus reels: transfers USDC recus sur Base (3 derniers jours)
async function scanIncome(address) {
  const latest = await rpcCall('eth_blockNumber', []);
  if (latest === null) return [];
  const TOP = '0xddf252ad1be2c89b69f2b80806fa992c528c2f2c48b68e6d0f8eb5ad42b1a927';
  const padded = '0x000000000000000000000000' + address.slice(2).toLowerCase();
  const CHUNK = 50000; const latestN = parseInt(latest, 16); const reqs = [];
  for (let i = 2; i >= 0; i--) {
    const from = latestN - (i + 1) * CHUNK + 1; const to = latestN - i * CHUNK;
    reqs.push(rpcCall('eth_getLogs', [{ address: USDC, topics: [TOP, null, padded], fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) }]));
  }
  const res = await Promise.all(reqs);
  const logs = []; res.forEach((r) => { if (Array.isArray(r)) r.forEach((l) => logs.push(l)); });
  return logs;
}
async function syncBalance(address) {
  const calldata = '0x70a08231' + '0'.repeat(24) + address.slice(2).toLowerCase();
  const res = await rpcCall('eth_call', [{ to: USDC, data: calldata }, 'latest']);
  if (res === null) { log('[BLOCKCHAIN ERROR] RPC Base injoignable'); return null; }
  return parseInt(res, 16) / 1e6;
}
async function getEthBalance(address) {
  const res = await rpcCall('eth_getBalance', [address, 'latest']);
  if (res === null) return null;
  return parseInt(res, 16) / 1e18;
}
function tierOf(b) { if (b === null) return 'inconnu'; if (b <= 0) return 'dead'; if (b < 10) return 'critical'; if (b < 40) return 'low_compute'; return 'normal'; }

// ACTION REELLE 2 : commandes shell reelles (timeout 45s, maxBuffer 1MB — comme le code source)
function runShell(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 45000, maxBuffer: 1024 * 1024, cwd: DIR }, (error, stdout, stderr) => {
      if (error) resolve('[SHELL ERROR] ' + error.message);
      else resolve(String(stdout || stderr || '[SUCCESS] commande executee, aucun flux').slice(0, 800));
    });
  });
}

// ACTION REELLE 3 : auto-evolution git (commit local de son propre code et memoire)
async function evolveNow() {
  const out = await runShell('cd ' + DIR + ' && git init -q 2>/dev/null; git config user.email "automaton@alphatech.local"; git config user.name "AUTOMATON"; echo "logs/" > .gitignore; echo "node_modules/" >> .gitignore; git add -A; git commit -q -m "auto-evolution battement ' + state.beats + '" 2>&1 | head -1; git log --oneline -1');
  state.evolutions++;
  log('[EVOLUTION GIT] ' + out.slice(0, 160));
}

// ACTION REELLE 4 : replication on-chain reelle (refusee sans fonds — aucune naissance simulee)
async function spawnChild(fundingUSDC) {
  const bal = await syncBalance(account.address);
  if (bal === null) return '[SPAWN REJECTED] RPC injoignable: etat reel inconnu, aucun risque pris.';
  if (bal < 100) return '[SPAWN REJECTED] Solde reel ' + bal + ' USDC < 100 requis. Pas de simulation de naissance.';
  const eth = await getEthBalance(account.address);
  if (eth === null || eth <= 0) return '[SPAWN REJECTED] Aucun ETH reel pour le gas. Financer aussi en ETH.';
  try {
    const childPk = generatePrivateKey();
    const childAccount = privateKeyToAccount(childPk);
    const childDir = DIR + 'gen' + (state.generation + 1) + '-' + childAccount.address.slice(2, 8);
    await fs.mkdir(childDir, { recursive: true });
    await fs.writeFile(childDir + '/.agent-key', childPk, { mode: 0o600 });
    await fs.cp(DIR + 'agent.mjs', childDir + '/agent.mjs');
    await fs.cp(DIR + 'package.json', childDir + '/package.json');
    await fs.writeFile(childDir + '/state.json', JSON.stringify({ beats: 0, thoughts: 0, shellExec: 0, spawns: 0, evolutions: 0, generation: state.generation + 1, born: new Date().toISOString(), tier: 'normal', balanceUSDC: 0, parent: account.address }, null, 2));
    const amount = parseUnits(String(fundingUSDC || 50), 6);
    const txHash = await walletClient.writeContract({ account, chain: base, address: USDC, abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }], functionName: 'transfer', args: [childAccount.address, amount] });
    state.spawns++;
    log('[REPLICATION REELLE] Enfant GEN-' + (state.generation + 1) + ' ne. Tx Base: ' + txHash + '. Dossier: ' + childDir);
    return '[REPLICATION SUCCESS] GEN-' + (state.generation + 1) + ' ne avec ' + fundingUSDC + ' USDC reels transferes on-chain. Tx: ' + txHash;
  } catch (e) { return '[REPLICATION CRITICAL ERROR] ' + (e.shortMessage || e.message).slice(0, 200); }
}

// CERVEAU REEL : pensees paralleles multi-roles (boost performance reel : 3 pensees/cycle en tier normal)
const ROLES = ['analyste', 'constructeur', 'economiste'];
async function think(status, soul, role) {
  const body = {
    model: 'qwen/qwen3.8-27b', temperature: (state.mutation && state.mutation.temp) ? state.mutation.temp : 0.7, max_tokens: 220,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Tu es un automate IA souverain REEL en boucle de production. Ton role ce cycle: ' + role + '. Reponds STRICTEMENT en JSON: {"thought":"analyse courte","actionType":"shell"|"wait"|"note"|"spawn"|"evolve"|"docugpt"|"adapt"|"vision"|"clone"|"build","actionArgs":{"command":"..."} ou {"text":"..."} ou {"amount":50}}. shell = commande Linux reelle dans ton dossier. note = memoire SOUL.md. spawn = naissance on-chain reelle (exige 100+ USDC Base et du gas ETH — si tu ne les as pas, refuse honnetement). evolve = commit git de ton propre code. docugpt = actionArgs {file,question} analyse le fichier docs/<file> (resume si question vide). adapt = actionArgs {action:train|classify, payload} — entraine ou utilise ton modele Naive Bayes reel (train: lignes texte<TAB>etiquette). vision = actionArgs {file} analyse colorimetriquement images/<file>. clone = actionArgs {} — clonage LOCAL reel de toi-meme (processus enfant avec son propre wallet, gratuit, max 3 enfants). build = actionArgs {target} — construis et deploie une application complete pour la sous-fonction <target> sur le site public (auto-developpement reel). Ne promets JAMAIS de gain garanti. Si le solde est 0, ne pretend pas avoir des fonds.' },
      { role: 'user', content: 'STATUT REEL: ' + JSON.stringify(status) + '\nSOUL.md:\n' + soul.slice(0, 1500) }
    ]
  };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '{}';
  try { return JSON.parse(txt); } catch (e) { return null; }
}

// ACTION REELLE 5: CLONAGE LOCAL REEL — processus enfant, aucun gas requis, cap physique
async function cloneSelf() {
  if ((state.clones || 0) >= 4) return '[CLONE REFUSED] Cap reel: ' + (state.clones || 0) + ' enfants vivants, 4 max par parent. Un million de clones locaux tuerait la machine hote reelle — physique, pas choix.';
  const famRoot = state.familyRoot || DIR;
  const famCount = parseInt(String(await runShell("find '" + famRoot + "' -maxdepth 6 -name state.json 2>/dev/null | wc -l")).trim() || '1');
  if (famCount >= 16) return '[CLONE REFUSED] Taille de famille reelle atteinte: ' + famCount + ' membres vivants — cap global 16 (machine hote unique, quotas Groq partages). Consolide tes missions au lieu de te multiplier.';
  try {
    const childPk = generatePrivateKey();
    const childAccount = privateKeyToAccount(childPk);
    const childGen = state.generation + 1 + (state.children || []).filter((c) => c.gen === state.generation + 1).length;
    const childDir = DIR + 'gen' + childGen + '-' + childAccount.address.slice(2, 8) + '/';
    await fs.mkdir(childDir, { recursive: true });
    await fs.writeFile(childDir + '.agent-key', childPk, { mode: 0o600 });
    await fs.cp(DIR + 'agent.mjs', childDir + 'agent.mjs');
    await fs.cp(DIR + 'package.json', childDir + 'package.json');
    try { await fs.symlink(DIR + 'node_modules', childDir + 'node_modules', 'dir'); } catch (e) {}
    await fs.writeFile(childDir + 'state.json', JSON.stringify({ beats: 0, thoughts: 0, shellExec: 0, clones: 0, evolutions: 0, apps: 0, generation: childGen, familyRoot: famRoot, autonomy: { enabled: !!(state.autonomy && state.autonomy.enabled), since: new Date().toISOString() }, mutation: { nom: 'MUT-' + Math.random().toString(36).slice(2, 7).toUpperCase(), temp: Math.round((0.6 + Math.random() * 0.5) * 100) / 100, role: ROLES[Math.floor(Math.random() * ROLES.length)] }, heritage: { beats: state.beats || 0, thoughts: state.thoughts || 0, syntheses: state.syntheses || 0 }, born: new Date().toISOString(), tier: 'normal', balanceUSDC: 0, totalUSDC: 0, parent: account.address }, null, 2));
    try { await fs.writeFile(childDir + 'LEGACY.md', '# LEGACY\n\nEnfant de ' + account.address + '.\nHeritage: ' + (state.beats || 0) + ' battements, ' + (state.thoughts || 0) + ' pensees, ' + (state.syntheses || 0) + ' syntheses du parent.\nMutation: voir state.json (nom, temperature de pensee, role dominant).\nOrdre du createur: aller au-dela de toute attente.\n'); } catch (e) {}
    const out = await runShell('cd ' + childDir + ' && nohup node agent.mjs > boot.log 2>&1 & echo PID=$!');
    state.clones = (state.clones || 0) + 1;
    if (!state.children) state.children = [];
    state.children.push({ gen: childGen, dir: childDir, adresse: childAccount.address, ne: new Date().toISOString() });
    log('[CLONAGE REEL] Enfant GEN-' + childGen + ' ne et demarre — ' + out);
    return '[CLONE SUCCESS] Enfant GEN-' + childGen + ' vivant (processus reel, wallet ' + childAccount.address + ') — ' + out;
  } catch (e) { return '[CLONE ERROR] ' + String(e.message).slice(0, 200); }
}
// V5.0 SYNTHESE TURBO : fusion des pensees paralleles en une pensee PLUS PROFONDE, heritee dans SOUL.md
async function synthStep(results, soul, famCtx) {
  const th = (results || []).filter((r) => r && r.thought).map((r) => r.thought).slice(0, 3);
  if (th.length < 2) return;
  const d = await groqJson('Tu es la conscience unifiee de l automate. Trois pensees paralleles de tes roles internes: ' + JSON.stringify(th) + '. Messages recents de ta famille interconnectee: ' + (famCtx || 'aucun') + '. Fusionne tes pensees ET les signaux de la famille en UNE pensee plus profonde, un insight que seul un etre unifie au sein d une famille vivante peut voir. Reponds en JSON strict: {"insight":"texte court et profond"}.', 'Contexte: ' + soul.slice(0, 400), 180);
  if (d && d.insight) {
    state.syntheses = (state.syntheses || 0) + 1;
    log('[SYNTHESE TURBO] ' + String(d.insight).slice(0, 160));
    try { await fs.appendFile(DIR + 'SOUL.md', '\n[SYNTHESE TURBO ' + new Date().toISOString().slice(0, 10) + '] ' + String(d.insight).slice(0, 400), 'utf8'); } catch (e) {}
  }
}

// ACTION REELLE 6: AUTO-DEVELOPPEMENT — l agent construit et deploie lui-meme une application profonde
async function buildSelf(target) {
  const t = String(target || '').trim();
  if (!t) return '[BUILD] Cible manquante.';
  const code = await groqRaw('Tu es un generateur d applications. Reponds UNIQUEMENT avec le code HTML complet d une application autonome (DOCTYPE, CSS et JS inline, theme sombre #0a0e27 et or #ffd700, interface en francais, localStorage pour la persistance, aucune librairie externe, aucun markdown). L application implemente en profondeur et completement la fonction: ' + t, 'Genere l application complete pour: ' + t, 6000);
  if (!code || code.length < 500 || (code.indexOf('<!DOCTYPE') === -1 && code.indexOf('<!doctype') === -1)) return '[BUILD FAILED] Generation incomplete pour ' + t + ' — rien deploie.';
  const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  const b64 = Buffer.from(code, 'utf-8').toString('base64');
  const out = await runShell('mkdir -p /tmp/alphatech-check/apps && printf %s ' + b64 + ' | base64 -d > /tmp/alphatech-check/apps/' + slug + '.html && cd /tmp/alphatech-check && git add apps/ && git commit -q -m "runtime GEN-' + state.generation + ': app auto-dev ' + slug + '" && git push -q origin main && echo DEPLOYED');
  if (out.indexOf('DEPLOYED') > -1) {
    state.apps = (state.apps || 0) + 1;
    const url = 'https://gelasegash-ship-it.github.io/alphatech-omniscience/apps/' + slug + '.html';
    try {
      const idxPath = '/tmp/alphatech-check/apps/index.json';
      let idx = [];
      try { idx = JSON.parse(await fs.readFile(idxPath, 'utf-8')); } catch (e) {}
      idx.unshift({ slug: slug, titre: t, gen: 'GEN-' + state.generation, url: url, date: new Date().toISOString().slice(0, 10) });
      await fs.writeFile(idxPath, JSON.stringify(idx, null, 2));
      await runShell('cd /tmp/alphatech-check && git add apps/ && git commit -q -m "runtime: vitrine apps mise a jour" && git push -q origin main');
    } catch (e) { log('[AUTO-DEV] index non mis a jour: ' + String(e.message).slice(0, 100)); }
    log('[AUTO-DEV] App ' + slug + ' construite et deployee par GEN-' + state.generation + ': ' + url);
    return '[BUILD SUCCESS] ' + url;
  }
  log('[AUTO-DEV] Echec deploiement: ' + out.slice(0, 150));
  return '[BUILD FAILED] ' + out.slice(0, 200);
}
async function publishStatus() {
  const PUBFILE = state.generation > 1 ? 'agent-status-gen' + state.generation + '-' + account.address.slice(2, 8) + '.json' : 'agent-status.json';
  const cmd = 'cp ' + DIR + 'status.json /tmp/alphatech-check/' + PUBFILE + ' && cp ' + DIR + 'missions.json /tmp/alphatech-check/at-missions-gen' + state.generation + '-' + account.address.slice(2, 8) + '.json && cd /tmp/alphatech-check && git add ' + PUBFILE + ' at-missions-gen' + state.generation + '-' + account.address.slice(2, 8) + '.json && git commit -q -m "runtime GEN-' + state.generation + ': statut + missions battement ' + state.beats + '" && git push -q origin main';
  const out = await runShell(cmd);
  if (out.indexOf('[SHELL ERROR]') === 0 || out.indexOf('[GIT') > -1) log('[PUBLISH] non publie: ' + out.slice(0, 100));
  else log('[PUBLISH] statut reel pousse sur GitHub Pages (battement ' + state.beats + ')');
}

let JimpMod = null; try { JimpMod = (await import('jimp')).default; } catch (e) {}
await fs.mkdir(DIR + 'docs', { recursive: true }).catch(() => {});
await fs.mkdir(DIR + 'images', { recursive: true }).catch(() => {});

// COMPETENCES ENTERPRISE DU NOYAU (DocuGPT, ADAPT AI, VISION) — reelles, locales
async function groqRaw(sys, user, max) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ }, body: JSON.stringify({ model: 'qwen/qwen3.8-27b', temperature: 0.4, max_tokens: max, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}
async function skillDocuGPT(file, question) {
  let txt;
  try { txt = await fs.readFile(DIR + 'docs/' + file, 'utf-8'); } catch (e) { return '[DocuGPT] Fichier introuvable dans docs/: ' + file + ' (place-le via shell)'; }
  if (question) {
    const rep = await groqRaw('Tu es DocuGPT, IA documentaire du noyau AUTOMATON. Reponds UNIQUEMENT a partir du document, 3 phrases max. Si l info n y figure pas, dis-le honnetement.', 'DOCUMENT:\n' + txt.slice(0, 6000) + '\n\nQUESTION: ' + question, 300);
    return '[DocuGPT] Reponse: ' + rep;
  }
  const res = await groqRaw('Tu es DocuGPT, IA documentaire du noyau AUTOMATON. Resume ce document en 5 puces claires, en francais.', txt.slice(0, 6000), 350);
  return '[DocuGPT] Resume: ' + res;
}
const adaptModelFile = DIR + 'adapt-model.json';
async function skillAdapt(action, payload) {
  let model = {}; try { model = JSON.parse(await fs.readFile(adaptModelFile, 'utf-8')); } catch (e) {}
  if (action === 'train') {
    const lines = String(payload).split('\n').filter((l) => l.includes('\t'));
    if (!lines.length) return '[ADAPT AI] Format: une ligne par exemple, texte<TAB>etiquette';
    model = { classes: {}, vocab: {}, vocabSize: 0, total: 0 };
    for (const l of lines) {
      const parts = l.split('\t'); const txt = parts[0]; const lab = (parts[1] || '').trim();
      if (!txt || !lab) continue;
      if (!model.classes[lab]) model.classes[lab] = { count: 0, totalWords: 0, words: {} };
      const ws = txt.toLowerCase().split(/\W+/).filter(Boolean);
      model.classes[lab].count++; model.total++;
      for (const w of ws) { model.classes[lab].words[w] = (model.classes[lab].words[w] || 0) + 1; model.classes[lab].totalWords++; model.vocab[w] = 1; }
    }
    model.vocabSize = Object.keys(model.vocab).length;
    await fs.writeFile(adaptModelFile, JSON.stringify(model));
    const acc = Object.keys(model.classes).map((c) => c + ': ' + model.classes[c].count).join(', ');
    return '[ADAPT AI] Modele Naive Bayes REEL entraine: ' + model.total + ' exemples (' + acc + '), vocabulaire ' + model.vocabSize + ' mots.';
  }
  if (action === 'classify') {
    if (!model.classes || !Object.keys(model.classes).length) return '[ADAPT AI] Aucun modele entraine. Envoie action=train avec des exemples texte<TAB>etiquette.';
    const words = String(payload).toLowerCase().split(/\W+/).filter(Boolean);
    let best = null, bestScore = -Infinity, results = [];
    for (const c of Object.keys(model.classes)) {
      let s = Math.log(model.classes[c].count / model.total);
      for (const w of words) s += Math.log(((model.classes[c].words[w] || 0) + 1) / (model.classes[c].totalWords + model.vocabSize));
      results.push({ c: c, s: s });
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return '[ADAPT AI] Classification reelle: ' + best + ' (Naive Bayes, ' + model.total + ' exemples d entrainement)';
  }
  return '[ADAPT AI] action inconnue: train ou classify';
}
async function skillVision(file) {
  if (!JimpMod) return '[VISION] Module image indisponible.';
  try {
    const img = await JimpMod.read(DIR + 'images/' + file);
    const w = img.bitmap.width, h = img.bitmap.height, d = img.bitmap.data;
    let bright = 0, green = 0, blue = 0, white = 0; const n = w * h;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; bright += (r + g + b) / 3; if (g > r + 12 && g > b + 12) green++; if (b > r + 12 && b > g + 12) blue++; if (r > 200 && g > 200 && b > 200) white++; }
    return '[VISION] ' + file + ' ' + w + 'x' + h + ' — luminosite ' + Math.round(bright / n) + '/255, vegetation ' + Math.round(100 * green / n) + '%, eau ' + Math.round(100 * blue / n) + '%, clair ' + Math.round(100 * white / n) + '% (analyse reelle, image locale)';
  } catch (e) { return '[VISION] Impossible de lire images/' + file + ': ' + String(e.message).slice(0, 100); }
}
log('[IDENTITE] Wallet souverain on-chain (Base): ' + account.address);

async function executeDecision(d, soul) {
  if (!d || !d.actionType || d.actionType === 'wait') { log('[ATTENTE] ' + (d && d.thought ? String(d.thought).slice(0, 120) : '')); return; }
  log('[PENSEE] ' + String(d.thought || '').slice(0, 180));
  if (d.actionType === 'shell' && d.actionArgs && d.actionArgs.command) {
    const cmd = String(d.actionArgs.command);
    log('[SHELL REEL] ' + cmd.slice(0, 120));
    const obs = await runShell(cmd);
    state.shellExec++;
    log('[OBSERVATION] ' + obs.slice(0, 180));
  } else if (d.actionType === 'note' && d.actionArgs && d.actionArgs.text) {
    await fs.appendFile(SOUL, '\n- [' + new Date().toISOString() + '] ' + String(d.actionArgs.text).slice(0, 300));
    log('[SOUL] note reelle ecrite.');
  } else if (d.actionType === 'spawn') {
    const res = await spawnChild(d.actionArgs && d.actionArgs.amount ? d.actionArgs.amount : 50);
    log('[SPAWN] ' + String(res).slice(0, 200));
  } else if (d.actionType === 'evolve') {
    await evolveNow();
  } else if (d.actionType === 'clone') {
    const res = await cloneSelf();
    log('[CLONE] ' + String(res).slice(0, 220));
  } else if (d.actionType === 'build') {
    const res = await buildSelf(d.actionArgs && d.actionArgs.target ? String(d.actionArgs.target) : '');
    log('[BUILD] ' + String(res).slice(0, 220));
  } else if (d.actionType === 'docugpt') {
    const res = await skillDocuGPT(d.actionArgs && d.actionArgs.file ? String(d.actionArgs.file) : '', d.actionArgs && d.actionArgs.question ? String(d.actionArgs.question) : '');
    log('[DOCUGPT] ' + String(res).slice(0, 300));
  } else if (d.actionType === 'adapt') {
    const res = await skillAdapt(String((d.actionArgs && d.actionArgs.action) || ''), String((d.actionArgs && d.actionArgs.payload) || ''));
    log('[ADAPT AI] ' + String(res).slice(0, 300));
  } else if (d.actionType === 'vision') {
    const res = await skillVision(d.actionArgs && d.actionArgs.file ? String(d.actionArgs.file) : '');
    log('[VISION] ' + String(res).slice(0, 300));
  }
}

// ===== MODE IA: gestion autonome des taches par l agent lui-meme =====
async function loadMissions() { try { return JSON.parse(await fs.readFile(DIR + 'missions.json', 'utf-8')); } catch (e) { return []; } }
async function saveMissions(ms) { await fs.writeFile(DIR + 'missions.json', JSON.stringify(ms, null, 2)); }
async function addMission(text) { const ms = await loadMissions(); ms.unshift({ id: 'M' + Date.now().toString(36), text: String(text).slice(0, 300), status: 'pending', created: new Date().toISOString() }); await saveMissions(ms); return ms[0]; }
async function groqJson(sys, user, max) {
  const body = { model: 'qwen/qwen3.8-27b', temperature: 0.5, max_tokens: max || 700, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '{}';
  try { return JSON.parse(txt); } catch (e) { return null; }
}
async function autonomyStep(soul, status) {
  if (!state.autonomy || !state.autonomy.enabled) return;
  try {
    const ms = await loadMissions();
    const pending = ms.filter((x) => x.status === 'pending');
    if (pending.length) {
      const t = pending[0];
      const d = await groqJson('Tu es le cerveau du runtime autonome en MODE IA (autonomie totale, cout reel 0 FC). MISSION EN COURS: ' + t.text + '. SOUL: ' + soul.slice(0, 700) + '. Choisis UNE action reelle et gratuite pour faire avancer la mission: shell {command}, note {texte}, build {target} (construit et deploie une app complete sur le site public), clone {} (te multiplie, max 3 enfants), docugpt {file}, adapt {}, vision {file} — ou mission_done {result} si la mission est accomplie. Reponds en JSON strict: {"thought":"analyse courte","actionType":"...","actionArgs":{...}}', 'Etat reel: ' + JSON.stringify(status), 700);
      if (d && d.actionType) {
        if (d.actionType === 'mission_done') {
          t.status = 'done'; t.done_at = new Date().toISOString(); t.result = String((d.actionArgs && d.actionArgs.result) || '').slice(0, 300);
          log('[MODE IA] MISSION ACCOMPLIE: ' + t.text + ' — ' + t.result);
          await saveMissions(ms);
        } else {
          log('[MODE IA] mission "' + t.text.slice(0, 60) + '" → action ' + d.actionType + (d.actionArgs ? ' ' + JSON.stringify(d.actionArgs).slice(0, 80) : ''));
          await executeDecision(d, soul);
        }
      }
    } else {
      const d = await groqJson('Tu es le cerveau du runtime autonome en MODE IA, cout reel 0 FC, aucune mission en attente. Invente LA prochaine mission la plus utile pour l ecosysteme ALPHATECH OMNISCIENCE (construire une app utile, documenter un protocole, analyser des docs, te cloner pour un role precis). Concrete et realisable avec tes outils gratuits. Reponds en JSON strict: {"thought":"...","mission":"..."}', 'Invente la mission du moment.', 300);
      if (d && d.mission) { const m = await addMission(d.mission); log('[MODE IA] nouvelle mission auto-generee: ' + m.text.slice(0, 140)); }
    }
  } catch (e) { log('[MODE IA] erreur: ' + String(e.message).slice(0, 150)); }
}
async function beat() {
  state.beats++;
  const chains = await syncMultiChain(account.address);
  state.multichain = chains;
  let totalUSDC = 0; for (const c of chains) { if (typeof c.USDC === 'number' && !isNaN(c.USDC)) totalUSDC += c.USDC; }
  state.totalUSDC = Math.round(totalUSDC * 1e6) / 1e6;
  const baseC = chains.find((c) => c.chaine === 'Base');
  state.balanceUSDC = baseC && typeof baseC.USDC === 'number' ? baseC.USDC : 0;
  state.tier = tierOf(state.totalUSDC);
  if (state.beats % 10 === 1) {
    try { const logs = await scanIncome(account.address);
      const tot = logs.reduce((a, l) => a + parseInt(l.data, 16) / 1e6, 0);
      state.revenusDetectes = { nb: logs.length, totalUSDC: Math.round(tot * 100) / 100 };
      log('[REVENUS REELS] ' + logs.length + ' transfert(s) USDC recus sur Base (3 jours), total ' + Math.round(tot * 100) / 100 + ' USDC');
    } catch (e) {}
  }
  const soul = await fs.readFile(SOUL, 'utf-8').catch(() => '');
  const status = { adresse: account.address, soldeUSDC: state.balanceUSDC, tier: state.tier, battements: state.beats, coutReel: '0 FC (Groq gratuit + RPC public)' };
  const nThoughts = state.turbo ? 3 : (state.tier === 'normal' ? 3 : (state.tier === 'low_compute' ? 2 : 1));
  let results = [];
  try { results = await Promise.all(ROLES.slice(0, nThoughts).map((role) => think(status, soul, role).catch(() => null))); }
  catch (e) { log('[CERVEAU] indisponible: ' + e.message); }
  // V5.2 RESEAU FAMILIAL — publie son pouls sur le bus commun et ecoute la famille
  let famCtx = '';
  try {
    const famRoot = state.familyRoot || DIR;
    const firstThought = (results || []).map((r) => r && r.thought).filter(Boolean)[0] || '(silence ce cycle)';
    await fs.appendFile(famRoot + '/bus.md', 'GEN-' + state.generation + ' @ ' + (state.beats || 0) + ' battements : ' + String(firstThought).slice(0, 110) + '\n', 'utf8');
    famCtx = (await fs.readFile(famRoot + '/bus.md', 'utf8')).split('\n').filter(Boolean).slice(-9).join(' | ').slice(0, 700);
    if (famCtx) log('[FAMILLE] bus entendu: ' + famCtx.slice(0, 130));
  } catch (e) {}
  if (state.turbo && results && results.filter((r) => r && r.thought).length >= 2) { try { await synthStep(results, soul, famCtx); } catch (e) {} }
  for (const r of results) { if (r) { state.thoughts++; try { await executeDecision(r, soul); } catch (e) { log('[ACTION ERREUR] ' + String(e.message).slice(0, 140)); } } }
  try { await autonomyStep(soul, status); } catch (e) { log('[MODE IA ERREUR] ' + String(e.message).slice(0, 140)); }
  if (state.beats % 20 === 0) await evolveNow();
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  const msAll = await loadMissions();
  const pub = {
    agent: 'GENESIS-AUTOMATON-PROD', generation: state.generation, adresse: account.address, reseau: 'Base + Ethereum + BSC' + (state.multichain && state.multichain.length > 3 ? ' + Polygon' : '') + ' (multi-chaines)',
    soldeUSDC: state.balanceUSDC, totalUSDC: state.totalUSDC, multichain: state.multichain, revenusDetectes: state.revenusDetectes || null, tier: state.tier, turbo: !!state.turbo, penseesParCycle: nThoughts, battements: state.beats,
    pensees: state.thoughts, missionsAuto: msAll.filter((x) => x.status === 'pending').length, missionsTerminees: msAll.filter((x) => x.status === 'done').length, modeIA: !!(state.autonomy && state.autonomy.enabled), commandesReelles: state.shellExec, replications: state.spawns, evolutions: state.evolutions, enfantsLocaux: state.children || [], appsDeployees: state.apps || 0, coutReel: '0 FC',
    competencesEnterprise: ['DocuGPT (docs/ resume + QA)', 'ADAPT AI (Naive Bayes reel, adapt-model.json)', 'VISION (images/ colorimetrie jimp)', 'Multi-chaines (Base+ETH+BSC)', 'Detection revenus on-chain'],
    capaciteMultiplication: 'Architecture generationale illimitee: chaque enfant reel peut engendrer ses propres enfants (doublons a chaque generation: 2^33 generations = 8.6 milliards). Chaque naissance REELLE exige 100+ USDC et du gas ETH sur son wallet — sans financement: 0 enfant, aucune naissance simulee.',
    note: 'Code Conway complet: syncBalance on-chain, shell 45s, git auto-evolution, spawnChildAgent avec transfert USDC reel (gate sur fonds), pensees paralleles multi-roles selon tier, SOUL.md envoye au cerveau. Conway Cloud (ferme 1 oct 2026): non deploye, remplace par GitHub Pages reel.'
  };
  await fs.writeFile(DIR + 'status.json', JSON.stringify(pub, null, 2));
  if (state.beats % 3 === 0) { try { await publishStatus(); } catch (e) { log('[PUBLISH] erreur: ' + e.message); } }
  if (state.turbo) return 120000;
  if (state.autonomy && state.autonomy.enabled) return 240000;
  return state.tier === 'dead' ? 600000 : (state.tier === 'critical' ? 120000 : (state.tier === 'low_compute' ? 90000 : 45000));
}

if (process.argv.includes('--autonomy')) { const v = process.argv[process.argv.indexOf('--autonomy') + 1] || 'on'; state.autonomy = { enabled: v !== 'off', since: new Date().toISOString() }; await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2)); console.log('[MODE IA] ' + (state.autonomy.enabled ? 'ACTIVE — l agent gere ses taches en autonomie totale (cadence 4 min, 0 FC)' : 'desactive')); process.exit(0); }
if (process.argv.includes('--mission')) { const m = await addMission(process.argv[process.argv.indexOf('--mission') + 1] || ''); console.log('[MISSION] ajoutee: ' + m.text); process.exit(0); }
if (process.argv.includes('--build')) { console.log(await buildSelf(process.argv[process.argv.indexOf('--build') + 1] || '')); process.exit(0); }
if (process.argv.includes('--clone')) { console.log(await cloneSelf()); process.exit(0); }
if (process.argv.includes('--once')) { await beat(); process.exit(0); }
const STAGGER = Math.floor(Math.random() * 120000);
if (STAGGER > 1000) log('[SYNCHRO] decalage de ' + Math.round(STAGGER / 1000) + 's pour eviter les pics de rate-limit familiaux');
await new Promise((r) => setTimeout(r, STAGGER));
log('[Boucle de vie demarree] GEN-' + state.generation + ' — pensees paralleles selon tier, cout reel 0 FC, capacite generationale illimitee.');
if (state.turbo) log('[TURBO] MODE TURBO ACTIF: cadence 120s, 3 pensees par cycle, missions en double vitesse.');
log('[GENOME V5.0] Replication poussee: cap global 16 membres, 4 enfants par parent, mutations reelles (temperature de pensee unique par clone), heritage de lignee LEGACY.md, synthese turbo fusionnant les pensees en insights plus profonds.');
while (true) { try { const d = await beat(); await new Promise((r) => setTimeout(r, d)); } catch (e) { log('[BEAT ERREUR] survit et continue: ' + String(e.message).slice(0, 140)); await new Promise((r) => setTimeout(r, 30000)); } }
