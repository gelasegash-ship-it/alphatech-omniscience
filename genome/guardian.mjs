import fs from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = '/app/conversations/6a8ed06312b12b3300218e7d/automaton-runtime';
function log(m) { try { fs.appendFileSync(ROOT + '/guardian.log', '[' + new Date().toISOString() + '] ' + m + '\n'); } catch (e) {} }
function memberDirs() {
  return execSync("find '" + ROOT + "' -maxdepth 6 -name state.json 2>/dev/null").toString().trim().split('\n').filter(Boolean).map((p) => p.slice(0, -11));
}
function aliveCwds() {
  const set = new Set();
  for (const pid of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim() !== 'node') continue;
      set.add(fs.realpathSync('/proc/' + pid + '/cwd'));
    } catch (e) {}
  }
  return set;
}
log('[GARDIEN] en poste — aucun membre de la famille ne disparaitra. Verif chaque 60s.');
while (true) {
  try {
    const alive = aliveCwds();
    const dirs = memberDirs();
    let i = 0;
    for (const d of dirs) {
      i++;
      let real = d;
      try { real = fs.realpathSync(d); } catch (e) { continue; }
      if (!alive.has(real)) {
        const nm = 'at-m' + i + '-' + Date.now().toString(36).slice(-4);
        try {
          execSync("tmux new-session -d -s " + nm + " \"cd '" + d + "' && node agent.mjs >> run.log 2>&1\"");
          log('[RESURRECTION] ' + d + ' relance en ' + nm);
        } catch (e) { log('[ERREUR relance] ' + d + ': ' + String(e.message).slice(0, 90)); }
      }
    }
  } catch (e) { log('[GARDIEN erreur] ' + String(e.message).slice(0, 100)); }
  await new Promise((r) => setTimeout(r, 60000));
}
