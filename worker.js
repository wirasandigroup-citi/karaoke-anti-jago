export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      await initDatabase(env);
      if (path === '/api/participants' && method === 'GET') return getParticipants(env);
      if (path === '/api/participants' && method === 'POST') return createParticipant(request, env);
      if (path.startsWith('/api/participants/') && method === 'DELETE') return deleteParticipant(decodeURIComponent(path.split('/').pop()), env);
      if (path === '/api/scores' && method === 'GET') return getScores(env);
      if (path === '/api/scores' && method === 'POST') return saveScore(request, env);
      if (path === '/api/settings' && method === 'GET') return getSettings(env);
      if (path === '/api/settings' && method === 'POST') return saveSettings(request, env);
      if (path === '/api/reset' && method === 'POST') return resetData(env);
      return new Response(htmlPage(), { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
    } catch (error) {
      return json({ ok:false, error:error.message || 'Terjadi kesalahan server' }, 500);
    }
  }
};

async function initDatabase(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, juror TEXT NOT NULL,
    grogi INTEGER NOT NULL DEFAULT 0, kaku INTEGER NOT NULL DEFAULT 0,
    lucu INTEGER NOT NULL DEFAULT 0, berani INTEGER NOT NULL DEFAULT 0,
    special_best INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_id, juror)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES('judge_count','2')`).run();
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers:{ 'Content-Type':'application/json; charset=UTF-8', 'Cache-Control':'no-store' } });
}
function normalizeJuror(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g,'');
  if (v === '1' || v === 'juri1') return 'juri1';
  if (v === '2' || v === 'juri2') return 'juri2';
  if (v === '3' || v === 'juri3') return 'juri3';
  return '';
}
function clamp(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }

async function getParticipants(env) {
  const r = await env.DB.prepare(`SELECT * FROM participants WHERE active=1 ORDER BY category, created_at`).all();
  return json({ok:true, participants:r.results || []});
}
async function createParticipant(request, env) {
  const body = await request.json();
  const name = String(body.name || '').trim();
  const category = String(body.category || '').toLowerCase();
  if (!name) return json({ok:false,error:'Nama peserta belum diisi'},400);
  if (!['solo','duet'].includes(category)) return json({ok:false,error:'Kategori harus Solo atau Duet'},400);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO participants(id,name,category,active) VALUES(?,?,?,1)`).bind(id,name,category).run();
  return json({ok:true,participant:{id,name,category}});
}
async function deleteParticipant(id, env) {
  await env.DB.prepare(`DELETE FROM scores WHERE participant_id=?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM participants WHERE id=?`).bind(id).run();
  return json({ok:true});
}
async function getScores(env) {
  const r = await env.DB.prepare(`SELECT s.*,p.name,p.category FROM scores s LEFT JOIN participants p ON p.id=s.participant_id ORDER BY p.category,p.created_at`).all();
  return json({ok:true,scores:r.results || []});
}
async function saveScore(request, env) {
  const body = await request.json();
  const participantId = String(body.participantId || '');
  const juror = normalizeJuror(body.juror);
  if (!participantId) return json({ok:false,error:'Peserta tidak ditemukan'},400);
  if (!juror) return json({ok:false,error:'Juri tidak valid. Pilih Juri 1, Juri 2, atau Juri 3.'},400);
  const participant = await env.DB.prepare(`SELECT id FROM participants WHERE id=?`).bind(participantId).first();
  if (!participant) return json({ok:false,error:'Peserta tidak ditemukan'},404);
  const grogi=clamp(body.grogi), kaku=clamp(body.kaku), lucu=clamp(body.lucu), berani=clamp(body.berani), specialBest=body.specialBest?1:0;
  const existing = await env.DB.prepare(`SELECT id FROM scores WHERE participant_id=? AND juror=? LIMIT 1`).bind(participantId,juror).first();
  if (existing) {
    await env.DB.prepare(`UPDATE scores SET grogi=?,kaku=?,lucu=?,berani=?,special_best=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(grogi,kaku,lucu,berani,specialBest,existing.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO scores(id,participant_id,juror,grogi,kaku,lucu,berani,special_best,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),participantId,juror,grogi,kaku,lucu,berani,specialBest).run();
  }
  return json({ok:true,juror});
}
async function getSettings(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key='judge_count'`).first();
  const judgeCount = Number(row?.value) === 3 ? 3 : 2;
  return json({ok:true,judgeCount});
}
async function saveSettings(request, env) {
  const body = await request.json(); const judgeCount = Number(body.judgeCount) === 3 ? 3 : 2;
  await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('judge_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(judgeCount)).run();
  return json({ok:true,judgeCount});
}
async function resetData(env) {
  await env.DB.prepare(`DELETE FROM scores`).run();
  await env.DB.prepare(`DELETE FROM participants`).run();
  return json({ok:true});
}

function htmlPage() { return String.raw`<!doctype html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Karaoke Grogi, Kaku & Lucu</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f3f7;color:#243244}.app{max-width:1000px;margin:auto;padding:12px}.header{background:#202c40;color:#fff;padding:20px;border-radius:18px;margin-bottom:12px}.header h1{margin:0 0 5px;font-size:25px}.header p{margin:0;font-size:14px;font-weight:bold}.tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}.tab,.btn,.juror{border:0;padding:11px 18px;border-radius:10px;background:#e0e6ee;color:#344054;font-weight:bold;cursor:pointer}.tab.active,.btn.primary,.juror.active{background:#28628f;color:#fff}.panel{display:none}.panel.active{display:block}.card{background:#fff;border-radius:18px;padding:18px;margin-bottom:12px;box-shadow:0 3px 14px rgba(30,50,70,.08)}h2{margin:0 0 14px;font-size:20px}h3{font-size:15px}.form-row{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:10px}input,select{width:100%;padding:12px;border:1px solid #cbd5df;border-radius:10px;font-size:15px}.judge-options,.juror-select{display:flex;gap:10px;flex-wrap:wrap}.judge-option{flex:1;min-width:180px;padding:14px;border:1px solid #cbd5df;border-radius:12px;cursor:pointer}.judge-option.active{border:2px solid #28628f;background:#f2f7fb}.score-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.score-box{border:1px solid #dde4eb;border-radius:12px;padding:14px}.score-box label{font-weight:bold;display:block;margin-bottom:6px}.score-info,.small{font-size:12px;color:#667085;margin-bottom:8px}.special{padding:14px;background:#fff7dd;border-radius:12px;margin-top:12px}.empty{padding:14px;background:#eef2f6;border-radius:10px;color:#667085}.participant-item{display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #e3e8ee;gap:10px}.delete{background:#c84848;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px}th,td{padding:11px;border-bottom:1px solid #dce3eb;text-align:left}th{font-size:13px}.score-value,.performance{font-weight:bold}.epic{color:#8a5b00}.great{color:#16733c}.good{color:#28628f}.fun{color:#8b4d9d}.low{color:#7b3d3d}.result-best{padding:14px;border-radius:10px;background:#fff3cd;font-weight:bold}@media(max-width:650px){.app{padding:8px}.header h1{font-size:21px}.form-row,.score-grid{grid-template-columns:1fr}.card{padding:15px}}
</style></head><body><div class="app">
<div class="header"><h1>🎤 Karaoke Grogi, Kaku & Lucu</h1><p id="headerSub">Realtime 2 Juri · Nilai Otomatis · Solo & Duet</p></div>
<div class="tabs"><button class="tab active" data-tab="admin">💻 Admin</button><button class="tab" data-tab="juri">👨‍⚖️ Juri</button><button class="tab" data-tab="hasil">🏆 Hasil</button></div>
<div class="panel active" id="admin">
 <div class="card"><h2>👥 Jumlah Juri</h2><div class="judge-options"><div class="judge-option active" id="judge2" onclick="setJudgeCount(2)"><b>👥 2 Juri</b><div class="small">Nilai akhir dari Juri 1 dan Juri 2</div></div><div class="judge-option" id="judge3" onclick="setJudgeCount(3)"><b>👥👥 3 Juri</b><div class="small">Nilai akhir dari Juri 1, 2 dan 3</div></div></div><p class="small">Jumlah juri aktif: <b id="judgeCountText">2</b></p></div>
 <div class="card"><h2>➕ Tambah Peserta</h2><div class="form-row"><input id="participantName" placeholder="Nama peserta / nama duet"><select id="participantCategory"><option value="solo">🎤 Solo</option><option value="duet">🎵 Duet</option></select><button class="btn primary" onclick="addParticipant()">Tambah Peserta</button></div></div>
 <div class="card"><h2>🎤 Peserta Sedang Tampil</h2><div id="currentParticipant" class="empty">Belum ada peserta yang dipilih.</div></div>
 <div class="card"><h2>📋 Daftar Peserta</h2><div id="participantList" class="empty">Memuat data...</div></div>
 <div class="card"><h2>⚠️ Pengaturan</h2><button class="delete" onclick="resetAll()">Hapus Semua Peserta & Nilai</button></div>
</div>
<div class="panel" id="juri"><div class="card"><h2>👨‍⚖️ Pilih Juri</h2><div id="jurorButtons" class="juror-select"></div></div><div class="card"><h2>🎤 Pilih Peserta</h2><select id="scoreParticipant" onchange="loadScoreForm()"></select></div><div class="card"><h2 id="scoreTitle">📝 Penilaian</h2><div class="score-grid"><div class="score-box"><label>😳 Grogi</label><div class="score-info">Bobot 30%</div><input id="grogi" type="number" min="0" max="100" value="0"></div><div class="score-box"><label>🗿 Kaku</label><div class="score-info">Bobot 25%</div><input id="kaku" type="number" min="0" max="100" value="0"></div><div class="score-box"><label>😂 Lucu</label><div class="score-info">Bobot 25%</div><input id="lucu" type="number" min="0" max="100" value="0"></div><div class="score-box"><label>🎤 Berani</label><div class="score-info">Bobot 20%</div><input id="berani" type="number" min="0" max="100" value="0"></div></div><div class="special"><label><input id="specialBest" type="checkbox"> ⭐ Kandidat Penampilan Terbaik</label><div class="small">Untuk peserta yang ingin mendapat penghargaan khusus.</div></div><br><button class="btn primary" style="width:100%;font-size:17px" onclick="submitScore()">💾 Simpan Nilai</button></div></div>
<div class="panel" id="hasil"><div class="card"><h2>🏆 Ranking Realtime</h2><h3>🎤 KATEGORI SOLO</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Peserta</th><th>Juri</th><th>Skor</th><th>Hasil Performance</th></tr></thead><tbody id="soloResults"></tbody></table></div><h3>🎵 KATEGORI DUET</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Peserta</th><th>Juri</th><th>Skor</th><th>Hasil Performance</th></tr></thead><tbody id="duetResults"></tbody></table></div></div><div class="card"><h2>🌟 Penampilan Terbaik</h2><div id="bestPerformance" class="empty">Belum ada pilihan Penampilan Terbaik.</div></div></div>
</div><script>
let participants=[],scores=[],judgeCount=2,currentJuror='juri1';
const api=async(path,opt={})=>{const r=await fetch(path,opt);const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||'Terjadi kesalahan');return d};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function jurorLabel(j){return 'Juri '+j.replace('juri','')}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');if(b.dataset.tab==='hasil')renderResults()});
async function loadAll(){try{const [p,s,set]=await Promise.all([api('/api/participants'),api('/api/scores'),api('/api/settings')]);participants=p.participants;scores=s.scores;judgeCount=set.judgeCount===3?3:2;updateJudgeUI();renderParticipants();renderParticipantSelect();renderJurorButtons();renderResults()}catch(e){console.error(e)}}
function updateJudgeUI(){document.getElementById('judgeCountText').textContent=judgeCount;document.getElementById('judge2').classList.toggle('active',judgeCount===2);document.getElementById('judge3').classList.toggle('active',judgeCount===3);document.getElementById('headerSub').textContent='Realtime '+judgeCount+' Juri · Nilai Otomatis · Solo & Duet'}
async function setJudgeCount(n){try{await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({judgeCount:n})});judgeCount=n;if(judgeCount===2&&currentJuror==='juri3')currentJuror='juri1';updateJudgeUI();renderJurorButtons();renderResults()}catch(e){alert(e.message)}}
async function addParticipant(){const name=document.getElementById('participantName').value.trim(),category=document.getElementById('participantCategory').value;if(!name)return alert('Masukkan nama peserta terlebih dahulu.');try{await api('/api/participants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,category})});document.getElementById('participantName').value='';document.getElementById('currentParticipant').innerHTML='<b>'+esc(name)+'</b> · '+(category==='solo'?'🎤 Solo':'🎵 Duet');await loadAll();alert('Peserta berhasil ditambahkan.')}catch(e){alert(e.message)}}
function renderParticipants(){const c=document.getElementById('participantList');if(!participants.length){c.className='empty';c.textContent='Belum ada peserta.';return}c.className='';c.innerHTML=participants.map(p=>'<div class="participant-item"><div><b>'+esc(p.name)+'</b><div class="small">'+(p.category==='solo'?'🎤 Solo':'🎵 Duet')+'</div></div><button class="delete" onclick="removeParticipant(\''+p.id+'\')">Hapus</button></div>').join('')}
async function removeParticipant(id){if(!confirm('Hapus peserta ini beserta nilainya?'))return;try{await api('/api/participants/'+encodeURIComponent(id),{method:'DELETE'});await loadAll()}catch(e){alert(e.message)}}
function renderParticipantSelect(){const sel=document.getElementById('scoreParticipant'),old=sel.value;sel.innerHTML='<option value="">-- Pilih Peserta --</option>'+participants.map(p=>'<option value="'+p.id+'">'+esc(p.name)+' - '+(p.category==='solo'?'Solo':'Duet')+'</option>').join('');if(participants.some(p=>p.id===old))sel.value=old}
function renderJurorButtons(){const c=document.getElementById('jurorButtons');let html='';for(let i=1;i<=judgeCount;i++){const j='juri'+i;html+='<button class="juror '+(currentJuror===j?'active':'')+'" onclick="selectJuror(\''+j+'\')">👨‍⚖️ Juri '+i+'</button>'}c.innerHTML=html;document.getElementById('scoreTitle').textContent='📝 Penilaian '+jurorLabel(currentJuror)}
function selectJuror(j){currentJuror=j;renderJurorButtons();loadScoreForm()}
function loadScoreForm(){['grogi','kaku','lucu','berani'].forEach(id=>document.getElementById(id).value=0);document.getElementById('specialBest').checked=false;const id=document.getElementById('scoreParticipant').value;if(!id)return;const s=scores.find(x=>x.participant_id===id&&x.juror===currentJuror);if(s){['grogi','kaku','lucu','berani'].forEach(k=>document.getElementById(k).value=s[k]);document.getElementById('specialBest').checked=Number(s.special_best)===1}}
async function submitScore(){const participantId=document.getElementById('scoreParticipant').value;if(!participantId)return alert('Pilih peserta terlebih dahulu.');const body={participantId,juror:currentJuror,grogi:document.getElementById('grogi').value,kaku:document.getElementById('kaku').value,lucu:document.getElementById('lucu').value,berani:document.getElementById('berani').value,specialBest:document.getElementById('specialBest').checked};try{await api('/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await loadAll();alert(jurorLabel(currentJuror)+' berhasil disimpan.')}catch(e){alert(e.message)}}
function calc(s){return Number(s.grogi||0)*.30+Number(s.kaku||0)*.25+Number(s.lucu||0)*.25+Number(s.berani||0)*.20}
function perf(n){if(n>=90)return['🔥 Gila, Ini Harus Menang!','epic'];if(n>=80)return['🏆 Mantap & Sangat Menghibur','great'];if(n>=70)return['👏 Bagus, Lumayan Pecah','good'];if(n>=50)return['😂 Lumayan Lucu & Berani','fun'];return['😳 Grogi Tapi Tetap Berjuang','low']}
function ranking(cat){return participants.filter(p=>p.category===cat).map(p=>{const ss=scores.filter(s=>s.participant_id===p.id&&Number(s.juror.replace('juri',''))<=judgeCount);const avg=ss.length?ss.reduce((a,s)=>a+calc(s),0)/ss.length:null;return{p,ss,avg}}).sort((a,b)=>(b.avg??-1)-(a.avg??-1))}
function renderCat(cat,id){const c=document.getElementById(id),r=ranking(cat);if(!r.length){c.innerHTML='<tr><td colspan="5">Belum ada peserta.</td></tr>';return}c.innerHTML=r.map((x,i)=>{const a=x.avg,p=a===null?['⏳ Menunggu penilaian','']:perf(a);return '<tr><td>'+ (i+1)+'</td><td><b>'+esc(x.p.name)+'</b></td><td>'+x.ss.length+'/'+judgeCount+'</td><td class="score-value">'+(a===null?'Menunggu':a.toFixed(2))+'</td><td class="performance '+p[1]+'">'+p[0]+'</td></tr>'}).join('')}
function renderBest(){const c=document.getElementById('bestPerformance');const a=participants.map(p=>{const ss=scores.filter(s=>s.participant_id===p.id&&Number(s.special_best)===1&&Number(s.juror.replace('juri',''))<=judgeCount);if(!ss.length)return null;return{p,v:ss.length,a:ss.reduce((x,s)=>x+calc(s),0)/ss.length}}).filter(Boolean).sort((x,y)=>y.v-x.v||y.a-x.a)[0];c.innerHTML=a?'<div class="result-best">🌟 <b>'+esc(a.p.name)+'</b><br><span class="small">Kategori: '+(a.p.category==='solo'?'Solo':'Duet')+' · Dipilih '+a.v+' juri · Nilai '+a.a.toFixed(2)+'</span></div>':'Belum ada pilihan Penampilan Terbaik.'}
function renderResults(){renderCat('solo','soloResults');renderCat('duet','duetResults');renderBest()}
async function resetAll(){if(!confirm('Yakin ingin menghapus SEMUA peserta dan nilai?'))return;try{await api('/api/reset',{method:'POST'});await loadAll();alert('Semua peserta dan nilai berhasil dihapus.')}catch(e){alert(e.message)}}
setInterval(loadAll,5000);loadAll();
</script></body></html>`; }
