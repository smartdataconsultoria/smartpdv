/* ══════════════════════════════════════════════
   SmartPDV · app.js
   Supabase multi-tenant backend
   Smartdata Consultoria
══════════════════════════════════════════════ */

// ─── CONFIGURAÇÃO SUPABASE ───────────────────
// ⚠️ Substitua pelas credenciais do seu projeto
const SUPA_URL  = 'https://uoijdemarffretkobdff.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvaWpkZW1hcmZmcmV0a29iZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzU4MzksImV4cCI6MjA5Njc1MTgzOX0.pRZHX_zWXzdgqXyVDDOdZVhrhKz-H0-s9iVK3kAsRoY';

// Helper de chamada ao Supabase REST
async function supa(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_token || SUPA_ANON}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function supaAuth(cpf, senha) {
  // Tenta CPF formatado e sem formatação
  const cpfFormatado = cpf.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const cpfDigitos   = cpf.replace(/\D/g,'');
  for (const c of [cpfFormatado, cpfDigitos]) {
    try {
      const rows = await supa(`promotores?cpf=eq.${encodeURIComponent(c)}&senha=eq.${encodeURIComponent(senha)}&select=*`);
      if (rows?.[0]) return rows[0];
    } catch(e) { console.warn('supaAuth:', c, e.message); }
  }
  return null;
}

// ─── ESTADO GLOBAL ───────────────────────────
let _user   = null;   // promotor logado
let _token  = null;   // JWT (quando usar Supabase Auth)
let _lojas  = [];     // lojas do promotor
let _lojaId = null;   // loja selecionada
let _produtos = [];   // produtos da empresa
let _concorrentes = [];
let _rankPeriodo = 'mes';

// ─── INICIALIZAÇÃO ───────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('spdv_user');
  if (saved) {
    _user = JSON.parse(saved);
    iniciarSessao();
  } else {
    mostrarLogin();
  }
  relogioTicker();
});

function mostrarLogin() {
  hide('overlay-loading');
  show('sc-login', 'flex');
}

async function iniciarSessao() {
  try {
    await carregarDadosBase();
    hide('overlay-loading');
    hide('sc-login');
    show('main-nav', 'flex');
    navTo('home');
  } catch(e) {
    mostrarLogin();
    toast('Erro ao carregar dados: ' + e.message, 'red');
  }
}

async function carregarDadosBase() {
  // Carrega lojas, produtos e concorrentes do promotor
  _lojas = await supa(`lojas_promotor?promotor_id=eq.${_user.id}&select=loja_id,lojas(id,nome,rede,cidade)`)
    .then(r => r.map(x => x.lojas));
  _produtos = await supa(`produtos?empresa_id=eq.${_user.empresa_id}&ativo=eq.true&select=*&order=nome`);
  _concorrentes = await supa(`similares_concorrentes?empresa_id=eq.${_user.empresa_id}&select=*`);
}

// ─── LOGIN ───────────────────────────────────
async function fazerLogin() {
  const cpf   = maskCPF(el('login-cpf').value.replace(/\D/g, ''));
  const senha = el('login-senha').value;
  if (!cpf || !senha) { toast('Preencha CPF e senha', 'red'); return; }

  hide('login-error');
  show('login-loading');
  try {
    const promotor = await supaAuth(cpf, senha);
    if (!promotor) throw new Error('Credenciais inválidas');
    _user = promotor;
    localStorage.setItem('spdv_user', JSON.stringify(promotor));
    hide('login-loading');
    show('overlay-loading');
    await iniciarSessao();
  } catch(e) {
    hide('login-loading');
    show('login-error');
  }
}

function fazerLogout() {
  localStorage.removeItem('spdv_user');
  localStorage.removeItem('spdv_loja');
  _user = null; _lojas = []; _lojaId = null; _produtos = []; _concorrentes = [];
  hide('main-nav');
  ['home','estoque','checklist','concorrentes','avarias','desempenho','metas','oportunidades','pontuacao','config']
    .forEach(s => hide('sc-' + s));
  mostrarLogin();
}

// ─── NAVEGAÇÃO ───────────────────────────────
const SCREENS = ['home','estoque','checklist','concorrentes','avarias','desempenho','metas','oportunidades','pontuacao','config'];

function navTo(nome) {
  SCREENS.forEach(s => {
    const sc = el('sc-' + s);
    if (sc) sc.style.display = (s === nome) ? 'flex' : 'none';
    const ni = el('ni-' + s);
    if (ni) ni.classList.toggle('active', s === nome);
  });
  if (nome === 'home') atualizarHome();
  if (nome === 'estoque') renderEstoque();
  if (nome === 'concorrentes') renderConcorrentes();
  if (nome === 'avarias') carregarAvarias();
  if (nome === 'config') renderConfig();
  if (nome === 'pontuacao') carregarRanking();
  window.scrollTo(0, 0);
}

// ─── HOME ─────────────────────────────────────
function atualizarHome() {
  const u = _user;
  if (!u) return;
  el('home-promotor-nome').textContent = u.nome || '';
  const h = new Date().getHours();
  el('greeting').textContent = h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
  atualizarData();
  carregarMetaHome();
  carregarResumoHome();
}

function atualizarData() {
  const d = new Date();
  el('hdate').textContent = d.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
}

async function carregarMetaHome() {
  if (!_user) return;
  try {
    const hoje = anoMes();
    const rows = await supa(`desempenho?promotor_id=eq.${_user.id}&periodo=eq.${hoje}&select=meta,realizado`);
    const d = rows?.[0];
    if (d) {
      el('home-meta-val').textContent = moeda(d.meta);
      el('home-real-val').textContent = moeda(d.realizado);
      const pct = d.meta > 0 ? Math.min(100, (d.realizado / d.meta) * 100) : 0;
      el('home-meta-bar').style.width = pct + '%';
      el('home-meta-pct').textContent = pct.toFixed(0) + '%';
      const diasRestantes = diasUteisRestantes();
      const falta = Math.max(0, d.meta - d.realizado);
      el('home-meta-dia').textContent  = diasRestantes > 0 ? moeda(falta / diasRestantes) : '—';
      el('home-meta-falta').textContent = moeda(falta);
      el('home-dias-restantes').textContent = diasRestantes + ' dias úteis';
    }
  } catch(e) { console.warn('Meta home:', e); }
}

async function carregarResumoHome() {
  if (!_lojaId) return;
  const hoje = dataHoje();
  try {
    const [estoques, avarias, checklist, concorrentes] = await Promise.all([
      supa(`estoque_lancamentos?loja_id=eq.${_lojaId}&data=eq.${hoje}&select=status`),
      supa(`avarias?loja_id=eq.${_lojaId}&data=eq.${hoje}&select=id`),
      supa(`checklists?promotor_id=eq.${_user.id}&loja_id=eq.${_lojaId}&data=eq.${hoje}&select=progresso`),
      supa(`precos_concorrentes?loja_id=eq.${_lojaId}&data=eq.${hoje}&select=id`)
    ]);
    const alertas = estoques.filter(x => x.status !== 'ok').length;
    el('home-est-alert').textContent = alertas || '✓';
    el('home-av').textContent = avarias.length || '0';
    const prog = checklist?.[0]?.progresso || 0;
    el('home-expo-pct').textContent = prog + '%';
    el('home-op').textContent = concorrentes.length || '0';
  } catch(e) { console.warn('Resumo home:', e); }
}

// ─── ESTOQUE ─────────────────────────────────
// similares por produto_id (carregados junto com os dados base)
let _simsPorProduto = {};

async function renderEstoque() {
  el('loja-est').textContent = nomeLojaAtual();
  if (!_lojaId || !_produtos.length) {
    el('lista-est').innerHTML = '<div class="ibox ibox-amber">Selecione uma loja e cadastre produtos primeiro.</div>';
    return;
  }
  const hoje = dataHoje();

  // Carrega similares da empresa para uso inline
  try {
    const sims = await supa(`similares_concorrentes?empresa_id=eq.${_user.empresa_id}&select=*`);
    _simsPorProduto = {};
    (sims || []).forEach(s => {
      if (!_simsPorProduto[s.produto_id]) _simsPorProduto[s.produto_id] = [];
      _simsPorProduto[s.produto_id].push(s);
    });
  } catch(e) { _simsPorProduto = {}; }

  const existente = await supa(`estoque_lancamentos?loja_id=eq.${_lojaId}&data=eq.${hoje}&select=*`).catch(() => []);
  const jaSalvo = existente.length > 0;

  if (jaSalvo) {
    hide('est-acoes');
    show('est-ja-salvo');
    el('lista-est').innerHTML = existente.map(e => itemEstoqueSalvo(e)).join('');
    return;
  }
  show('est-acoes');
  hide('est-ja-salvo');

  const produtosDaLoja = _produtos.filter(p => {
    const lojas = p.loja_ids || [];
    return lojas.length === 0 || lojas.includes(_lojaId);
  });

  el('lista-est').innerHTML = produtosDaLoja.map(p => {
    const sims = _simsPorProduto[p.id] || [];
    const temSimilar = sims.length > 0;
    const simRows = sims.map(s => `
      <div class="sim-conc-row" data-sim-id="${s.id}">
        <div class="sim-conc-label">
          <span class="sim-conc-nome">${s.empresa_concorrente}</span>
          <span class="sim-produto-nome">${s.produto_similar}</span>
        </div>
        <div class="sim-conc-grid">
          <div>
            <label>Preço concorrente (R$)</label>
            <input type="text" class="sim-preco-input" placeholder="0,00" inputmode="decimal"
              data-meu-preco="${p.preco_sugerido || 0}"
              oninput="calcDiffInline(this)">
          </div>
          <div>
            <label>Estoque concorrente</label>
            <input type="number" class="sim-estoque-conc" placeholder="0,00" inputmode="decimal" step="0.01" min="0">
          </div>
          <div>
            <label>Venda concorrente</label>
            <input type="number" class="sim-venda-conc" placeholder="0,00" inputmode="decimal" step="0.01" min="0">
          </div>
          <div class="sim-diff-wrap">
            <label>Diferença</label>
            <div class="sim-diff-badge" id="diff-inline-${s.id}">—</div>
          </div>
        </div>
      </div>
    `).join('');

    return `
    <div class="est-item" data-id="${p.id}">
      <div class="est-item-header">
        <div class="est-item-nome">${p.nome}${p.sku ? `<span class="est-sku">${p.sku}</span>` : ''}</div>
        <div class="est-item-preco-ref">${p.preco_sugerido ? moeda(p.preco_sugerido) : ''}</div>
      </div>

      <!-- Linha 1: Estoque sistema + Contagem física -->
      <div class="est-inputs">
        <div>
          <label>Estoque sistema</label>
          <input type="number" class="est-sistema" placeholder="0,00" inputmode="decimal" step="0.01" min="0" oninput="calcStatus(this)">
        </div>
        <div>
          <label>Contagem física</label>
          <input type="number" class="est-fisico" placeholder="0,00" inputmode="decimal" step="0.01" min="0" oninput="calcStatus(this)">
        </div>
      </div>

      <!-- Linha 2: Qtd vendida + Preço atual + Ruptura -->
      <div class="est-inputs" style="margin-top:0">
        <div>
          <label>Qtd vendida</label>
          <input type="number" class="est-vendido" placeholder="0,00" inputmode="decimal" step="0.01" min="0">
        </div>
        <div>
          <label>Preço atual (R$)</label>
          <input type="text" class="est-preco" placeholder="0,00" inputmode="decimal">
        </div>
        <div>
          <label>Ruptura?</label>
          <select class="est-ruptura">
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
      </div>

      <div class="est-status est-ok">✓ OK</div>

      <!-- Toggle similar -->
      ${temSimilar ? `
      <div class="sim-toggle-bar" onclick="toggleSimilar(this)">
        <span class="sim-toggle-icon">🔄</span>
        <span class="sim-toggle-txt">Preencher preços dos concorrentes <span class="sim-count-badge">${sims.length}</span></span>
        <span class="sim-toggle-arrow">▾</span>
      </div>
      <div class="sim-conc-panel" style="display:none">
        <div class="sim-panel-label">Pesquisa de preços — preencha o que encontrar na loja</div>
        ${simRows}
      </div>
      ` : ''}
    </div>`;
  }).join('');
}

function toggleSimilar(bar) {
  const panel = bar.nextElementSibling;
  const arrow = bar.querySelector('.sim-toggle-arrow');
  const open  = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(180deg)';
  bar.classList.toggle('sim-toggle-open', !open);
}

function calcDiffInline(input) {
  const meu  = parseFloat(input.dataset.meuPreco) || 0;
  const conc = parseFloat(input.value.replace(',', '.')) || 0;
  const row  = input.closest('.sim-conc-row');
  const simId = row?.dataset.simId;
  const badge = simId ? document.getElementById('diff-inline-' + simId) : null;
  if (!badge || !conc) { if (badge) badge.textContent = '—'; return; }
  const diff = conc - meu;
  badge.textContent = (diff > 0 ? '+' : '') + moeda(diff);
  badge.className = 'sim-diff-badge ' + (diff > 0 ? 'diff-pos' : diff < 0 ? 'diff-neg' : '');
}

function calcStatus(input) {
  const item = input.closest('.est-item');
  const sis = parseFloat(item.querySelector('.est-sistema').value) || 0;
  const fis = parseFloat(item.querySelector('.est-fisico').value) || 0;
  const div = sis > 0 ? Math.abs(sis - fis) / sis * 100 : 0;
  const badge = item.querySelector('.est-status');
  badge.className = div > 15 ? 'est-status est-critico' :
                    div > 5  ? 'est-status est-alert' : 'est-status est-ok';
  badge.textContent = div > 15 ? `⚠️ Crítico (${div.toFixed(0)}%)` :
                      div > 5  ? `⚡ Alerta (${div.toFixed(0)}%)` : '✓ OK';
}

function itemEstoqueSalvo(e) {
  const div = e.sistema > 0 ? Math.abs(e.sistema - e.fisico) / e.sistema * 100 : 0;
  const cls = div > 15 ? 'est-critico' : div > 5 ? 'est-alert' : 'est-ok';
  const lbl = div > 15 ? `Crítico ${div.toFixed(0)}%` : div > 5 ? `Alerta ${div.toFixed(0)}%` : 'OK';
  const prod = _produtos.find(p => p.id === e.produto_id);
  return `<div class="est-item">
    <div class="est-item-header">
      <div class="est-item-nome">${prod?.nome || e.nome_produto || e.produto_id}${prod?.sku ? `<span class="est-sku">${prod.sku}</span>` : ''}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:12px;color:var(--text2);margin-bottom:6px">
      <div><div style="font-size:10px;color:var(--text3)">Sistema</div><strong>${e.sistema}</strong></div>
      <div><div style="font-size:10px;color:var(--text3)">Físico</div><strong>${e.fisico}</strong></div>
      <div><div style="font-size:10px;color:var(--text3)">Vendido</div><strong>${e.qtd_vendida || '—'}</strong></div>
      <div><div style="font-size:10px;color:var(--text3)">Preço</div><strong>${moeda(e.preco)}</strong></div>
    </div>
    <div class="est-status ${cls}">${lbl}</div>
  </div>`;
}

function editarLancamento() {
  hide('est-ja-salvo');
  show('est-acoes');
  renderEstoque();
}

async function salvarEstoque() {
  if (!_lojaId) { toast('Selecione uma loja', 'red'); return; }
  const items = document.querySelectorAll('#lista-est .est-item');
  if (!items.length) { toast('Nenhum produto para salvar', 'red'); return; }

  const hoje = dataHoje();

  // Coleta estoque
  const registros = Array.from(items).map(item => {
    const pid      = item.dataset.id;
    const sis      = parseFloat(item.querySelector('.est-sistema')?.value) || 0;
    const fis      = parseFloat(item.querySelector('.est-fisico')?.value) || 0;
    const vendido  = parseFloat(item.querySelector('.est-vendido')?.value) || 0;
    const preco    = parseFloat(item.querySelector('.est-preco')?.value?.replace(',','.')) || 0;
    const ruptura  = item.querySelector('.est-ruptura')?.value === 'sim';
    const div      = sis > 0 ? Math.abs(sis - fis) / sis * 100 : 0;
    return {
      empresa_id: _user.empresa_id,
      loja_id: _lojaId,
      promotor_id: _user.id,
      produto_id: pid,
      data: hoje,
      sistema: sis,
      fisico: fis,
      qtd_vendida: vendido,
      divergencia_pct: parseFloat(div.toFixed(2)),
      preco,
      ruptura,
      status: div > 15 ? 'critico' : div > 5 ? 'alerta' : 'ok'
    };
  });

  // Coleta preços + estoque + venda dos concorrentes preenchidos inline
  const precosConc = [];
  document.querySelectorAll('#lista-est .sim-conc-row').forEach(row => {
    const simId       = row.dataset.simId;
    const precoI      = row.querySelector('.sim-preco-input');
    const estoqueConc = parseFloat(row.querySelector('.sim-estoque-conc')?.value) || 0;
    const vendaConc   = parseFloat(row.querySelector('.sim-venda-conc')?.value) || 0;
    const val         = parseFloat(precoI?.value?.replace(',','.')) || 0;
    // salva se tiver pelo menos um campo preenchido
    if (!val && !estoqueConc && !vendaConc) return;
    if (!simId) return;
    const estItem = row.closest('.est-item');
    const pid  = estItem?.dataset.id;
    const prod = _produtos.find(p => p.id === pid);
    precosConc.push({
      empresa_id:          _user.empresa_id,
      loja_id:             _lojaId,
      promotor_id:         _user.id,
      produto_id:          pid,
      similar_id:          simId,
      preco_concorrente:   val,
      preco_proprio:       prod?.preco_sugerido || 0,
      estoque_concorrente: estoqueConc,
      venda_concorrente:   vendaConc,
      data:                hoje
    });
  });

  try {
    await supa('estoque_lancamentos', {
      method: 'POST', body: registros, prefer: 'resolution=merge-duplicates'
    });
    if (precosConc.length) {
      await supa('precos_concorrentes', {
        method: 'POST', body: precosConc, prefer: 'resolution=merge-duplicates'
      });
    }
    await registrarPontos('estoque_salvo', 10);
    const extra = precosConc.length ? ` + ${precosConc.length} preço(s) de concorrente` : '';
    toast(`Salvo! +10pts 🎯${extra}`);
    renderEstoque();
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'red');
  }
}

// ─── CHECKLIST ───────────────────────────────
function tgl(el) {
  el.classList.toggle('done');
  atualizarRing();
}

function atualizarRing() {
  const total = document.querySelectorAll('#sc-checklist .ci').length;
  const done  = document.querySelectorAll('#sc-checklist .ci.done').length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;
  const circ  = 169.6;
  el('ring-fill').style.strokeDashoffset = circ - (circ * pct / 100);
  el('ring-pct-text').textContent = pct + '%';
  el('ring-pct').textContent  = pct + '%';
  el('ring-lbl').textContent  = `${done} de ${total} tarefas concluídas`;
  el('home-check-bar').style.width = pct + '%';
  el('home-check-val').textContent = pct + '%';
  el('home-check-txt').textContent = done === total ? '✅ Todas as tarefas concluídas!' : `${total - done} itens pendentes`;
}

async function salvarChecklist() {
  if (!_lojaId) { toast('Selecione uma loja', 'red'); return; }
  const total = document.querySelectorAll('#sc-checklist .ci').length;
  const done  = document.querySelectorAll('#sc-checklist .ci.done').length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;
  const itens = Array.from(document.querySelectorAll('#sc-checklist .ci')).map(c => ({
    label: c.querySelector('.ci-label')?.textContent,
    done: c.classList.contains('done')
  }));
  try {
    await supa('checklists', {
      method: 'POST',
      body: {
        empresa_id: _user.empresa_id,
        promotor_id: _user.id,
        loja_id: _lojaId,
        data: dataHoje(),
        progresso: pct,
        itens,
        total,
        concluidos: done
      },
      prefer: 'resolution=merge-duplicates'
    });
    if (pct === 100) await registrarPontos('checklist_completo', 20);
    toast(`Checklist salvo! ${pct}%`);
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'red');
  }
}

// ─── CONCORRENTES ────────────────────────────
function renderConcorrentes() {
  el('loja-conc').textContent = nomeLojaAtual();
  const container = el('lista-conc');
  const meusProd  = [...new Set(_concorrentes.map(c => c.produto_id))];
  if (!meusProd.length) {
    container.innerHTML = '<div class="ibox ibox-amber">Cadastre os similares em Configurações primeiro.</div>';
    return;
  }
  container.innerHTML = meusProd.map(pid => {
    const prod = _produtos.find(p => p.id === pid);
    if (!prod) return '';
    const similares = _concorrentes.filter(c => c.produto_id === pid);
    return `<div class="conc-item">
      <div class="conc-item-nome">${prod.nome} — Preço próprio: <strong>${moeda(prod.preco_sugerido)}</strong></div>
      ${similares.map(s => `
        <div class="conc-row">
          <div>
            <div class="conc-empresa">${s.empresa_concorrente}</div>
            <div style="font-size:11px;color:var(--text3)">${s.produto_similar}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="conc-input" type="text" placeholder="0,00" inputmode="decimal"
              data-pid="${pid}" data-sid="${s.id}" data-preco="${prod.preco_sugerido || 0}"
              oninput="calcDiff(this)">
            <div class="conc-diff" id="diff-${s.id}">—</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }).join('');
}

function calcDiff(input) {
  const meu = parseFloat(input.dataset.preco) || 0;
  const conc = parseFloat(input.value.replace(',', '.')) || 0;
  const diff = input.closest ? input.closest('.conc-row')?.querySelector('.conc-diff') : null;
  if (!diff || !conc) return;
  const d = conc - meu;
  diff.className = 'conc-diff ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '');
  diff.textContent = (d > 0 ? '+' : '') + moeda(d);
}

async function salvarConcorrentes() {
  if (!_lojaId) { toast('Selecione uma loja', 'red'); return; }
  const inputs = document.querySelectorAll('#lista-conc .conc-input');
  const registros = Array.from(inputs)
    .filter(i => i.value)
    .map(i => ({
      empresa_id: _user.empresa_id,
      loja_id: _lojaId,
      promotor_id: _user.id,
      produto_id: i.dataset.pid,
      similar_id: i.dataset.sid,
      preco_concorrente: parseFloat(i.value.replace(',', '.')) || 0,
      preco_proprio: parseFloat(i.dataset.preco) || 0,
      data: dataHoje()
    }));
  if (!registros.length) { toast('Nenhum preço informado', 'red'); return; }
  try {
    await supa('precos_concorrentes', { method: 'POST', body: registros });
    await registrarPontos('concorrente_registrado', 5 * registros.length);
    toast(`${registros.length} preço(s) salvo(s)! +${5 * registros.length}pts`);
  } catch(e) {
    toast('Erro: ' + e.message, 'red');
  }
}

// ─── AVARIAS ─────────────────────────────────
function previewFoto(input, previewId) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    el(previewId).innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;max-height:180px;object-fit:cover">`;
  };
  reader.readAsDataURL(input.files[0]);
}

async function salvarAvaria() {
  const pid  = el('av-produto').value;
  const qty  = parseInt(el('av-qty').value);
  const tipo = el('av-tipo').value;
  const obs  = el('av-obs').value;
  if (!pid || !qty || !tipo) { toast('Preencha produto, quantidade e tipo', 'red'); return; }
  if (!_lojaId) { toast('Selecione uma loja', 'red'); return; }

  let foto_url = null;
  const fotoInput = el('av-foto-input');
  if (fotoInput.files[0]) {
    foto_url = await uploadFoto(fotoInput.files[0], 'avarias');
  }

  const prod = _produtos.find(p => p.id === pid);
  const valor = (prod?.preco_sugerido || 0) * qty;

  try {
    await supa('avarias', {
      method: 'POST',
      body: {
        empresa_id: _user.empresa_id,
        loja_id: _lojaId,
        promotor_id: _user.id,
        produto_id: pid,
        quantidade: qty,
        tipo,
        observacao: obs,
        foto_url,
        valor_estimado: valor,
        data: dataHoje(),
        status: 'pendente'
      }
    });
    await registrarPontos('avaria_registrada', 8);
    toast('Avaria registrada! +8pts');
    el('av-produto').value = '';
    el('av-qty').value = '';
    el('av-tipo').value = '';
    el('av-obs').value = '';
    el('av-foto-preview').innerHTML = '📷 Toque para tirar foto';
    carregarAvarias();
  } catch(e) {
    toast('Erro: ' + e.message, 'red');
  }
}

async function carregarAvarias() {
  el('loja-av').textContent = nomeLojaAtual();
  // Popula select de produtos
  const sel = el('av-produto');
  sel.innerHTML = '<option value="">Selecione o produto</option>' +
    _produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

  if (!_lojaId) return;
  try {
    const rows = await supa(`avarias?loja_id=eq.${_lojaId}&data=eq.${dataHoje()}&select=*,produtos(nome)&order=created_at.desc`);
    el('lista-avarias').innerHTML = rows.length ? rows.map(a => `
      <div class="av-item">
        <div class="av-info">
          <div class="av-nome">${a.produtos?.nome || '—'}</div>
          <div class="av-det">${a.tipo} · ${a.observacao || ''}</div>
          ${a.valor_estimado ? `<div class="av-det">Valor estimado: ${moeda(a.valor_estimado)}</div>` : ''}
        </div>
        <div class="av-qty">${a.quantidade}x</div>
      </div>
    `).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">Nenhuma avaria hoje.</div>';
  } catch(e) { console.warn('Avarias:', e); }
}

// ─── UPLOAD FOTO ─────────────────────────────
async function uploadFoto(file, bucket) {
  const nome = `${_user.empresa_id}/${_lojaId}/${Date.now()}_${file.name}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${nome}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_token || SUPA_ANON}`,
      'Content-Type': file.type
    },
    body: file
  });
  if (!res.ok) throw new Error('Falha no upload da foto');
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${nome}`;
}

// ─── DESEMPENHO ───────────────────────────────
function calcMeta() {
  const meta  = parseFloat(el('fat-meta-input')?.value) || 0;
  const real  = parseFloat(el('fat-real-input')?.value) || 0;
  const pct   = meta > 0 ? (real / meta * 100).toFixed(0) : 0;
  const dias  = diasUteisRestantes();
  const falta = Math.max(0, meta - real);
  const proj  = dias > 0 ? real + (real / (diasUteisDoMes() - dias + 1)) * dias : real;
  if (el('desemp-pct'))      el('desemp-pct').textContent = pct + '%';
  if (el('desemp-proj-fim')) el('desemp-proj-fim').textContent = moeda(proj);
  if (el('home-fat-bar'))    el('home-fat-bar').style.width = Math.min(100, pct) + '%';
  if (el('home-fat-pct'))    el('home-fat-pct').textContent = pct + '%';
  if (el('home-fat-real'))   el('home-fat-real').textContent = moeda(real);
  if (el('home-fat-meta'))   el('home-fat-meta').textContent = moeda(meta);
}

async function salvarDesempenho() {
  const meta = parseFloat(el('fat-meta-input')?.value) || 0;
  const real = parseFloat(el('fat-real-input')?.value) || 0;
  try {
    await supa('desempenho', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        empresa_id: _user.empresa_id,
        promotor_id: _user.id,
        periodo: anoMes(),
        meta, realizado: real
      }
    });
    toast('Desempenho salvo!');
    carregarMetaHome();
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

// ─── OPORTUNIDADES ───────────────────────────
async function addOportunidade() {
  const tipo      = el('op-tipo').value;
  const produto   = el('op-produto').value;
  const desc      = el('op-desc').value;
  const prioridade = el('op-prioridade').value;
  if (!tipo || !desc) { toast('Preencha tipo e descrição', 'red'); return; }
  if (!_lojaId) { toast('Selecione uma loja', 'red'); return; }
  try {
    await supa('oportunidades', {
      method: 'POST',
      body: {
        empresa_id: _user.empresa_id,
        loja_id: _lojaId,
        promotor_id: _user.id,
        tipo, produto, descricao: desc,
        prioridade, data: dataHoje(), status: 'aberta'
      }
    });
    await registrarPontos('oportunidade_registrada', 6);
    toast('Oportunidade registrada! +6pts');
    el('op-tipo').value = '';
    el('op-produto').value = '';
    el('op-desc').value = '';
    carregarOportunidades();
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

async function carregarOportunidades() {
  if (!_lojaId) return;
  try {
    const rows = await supa(`oportunidades?loja_id=eq.${_lojaId}&status=eq.aberta&order=prioridade.desc,created_at.desc&select=*`);
    el('lista-op').innerHTML = rows.map(o => `
      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600">${o.tipo}</span>
          <span class="badge ${o.prioridade === 'alta' ? 'b-red' : o.prioridade === 'baixa' ? 'b-neutral' : 'b-amber'}">${o.prioridade}</span>
        </div>
        <div style="font-size:12px;color:var(--text2)">${o.descricao}</div>
        ${o.produto ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">📦 ${o.produto}</div>` : ''}
      </div>
    `).join('') || '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">Nenhuma oportunidade aberta.</div>';
  } catch(e) { console.warn(e); }
}

// ─── CONFIG ──────────────────────────────────
function renderConfig() {
  if (_user) {
    el('cfg-nome').value = _user.nome || '';
    el('cfg-usuario-logado').textContent = _user.cpf || '';
  }
  renderLojasCfg();
  renderProdutosCfg();
  renderConcorrentesCfg();
}

function renderLojasCfg() {
  el('lojas-lista').innerHTML = _lojas.map((l, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:600">${l.nome}</div>
        <div style="font-size:11px;color:var(--text3)">${l.rede || ''} · ${l.cidade || ''}</div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removerLoja(${i})">✕</button>
    </div>
  `).join('') || '<div style="font-size:12px;color:var(--text3)">Nenhuma loja cadastrada.</div>';
}

async function addLoja() {
  const nome   = el('nova-loja-nome').value.trim();
  const rede   = el('nova-loja-rede').value.trim();
  const cidade = el('nova-loja-cidade').value.trim();
  if (!nome) { toast('Informe o nome da loja', 'red'); return; }
  try {
    const [loja] = await supa('lojas', {
      method: 'POST',
      body: { empresa_id: _user.empresa_id, nome, rede, cidade }
    });
    await supa('lojas_promotor', {
      method: 'POST',
      body: { promotor_id: _user.id, loja_id: loja.id }
    });
    _lojas.push(loja);
    el('nova-loja-nome').value = '';
    el('nova-loja-rede').value = '';
    el('nova-loja-cidade').value = '';
    renderLojasCfg();
    toast('Loja adicionada!');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

async function removerLoja(i) {
  const loja = _lojas[i];
  try {
    await supa(`lojas_promotor?promotor_id=eq.${_user.id}&loja_id=eq.${loja.id}`, { method: 'DELETE' });
    _lojas.splice(i, 1);
    renderLojasCfg();
    toast('Loja removida');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

function renderProdutosCfg() {
  const lista = el('lista-produtos-cfg');
  lista.innerHTML = _produtos.map((p, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:600">${p.nome}</div>
        <div style="font-size:11px;color:var(--text3)">${p.sku || ''} · Mín: ${p.estoque_minimo || 0} · ${moeda(p.preco_sugerido)}</div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removerProduto(${i})">✕</button>
    </div>
  `).join('') || '<div style="font-size:12px;color:var(--text3)">Nenhum produto cadastrado.</div>';
  // Atualiza checkboxes de lojas
  const check = el('np-lojas-check');
  check.innerHTML = _lojas.map(l => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px">
      <input type="checkbox" value="${l.id}"> ${l.nome}
    </label>
  `).join('') || '<div style="font-size:12px;color:var(--text3);font-style:italic">Cadastre lojas primeiro.</div>';
  // Select de similares
  const sel = el('nc-meu-produto');
  if (sel) sel.innerHTML = '<option value="">Selecione</option>' + _produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

async function addProduto() {
  const nome  = el('np-nome').value.trim();
  const sku   = el('np-sku').value.trim();
  const min   = parseInt(el('np-minimo').value) || 0;
  const fornec = el('np-fornecedor').value.trim();
  const preco = parseFloat(el('np-preco').value?.replace(',', '.')) || 0;
  const loja_ids = Array.from(document.querySelectorAll('#np-lojas-check input:checked')).map(i => i.value);
  if (!nome) { toast('Informe o nome do produto', 'red'); return; }
  try {
    const [prod] = await supa('produtos', {
      method: 'POST',
      body: { empresa_id: _user.empresa_id, nome, sku, estoque_minimo: min, fornecedor: fornec, preco_sugerido: preco, loja_ids, ativo: true }
    });
    _produtos.push(prod);
    el('np-nome').value = '';
    el('np-sku').value = '';
    el('np-minimo').value = '';
    el('np-fornecedor').value = '';
    el('np-preco').value = '';
    renderProdutosCfg();
    toast('Produto adicionado!');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

async function removerProduto(i) {
  const p = _produtos[i];
  try {
    await supa(`produtos?id=eq.${p.id}`, { method: 'PATCH', body: { ativo: false } });
    _produtos.splice(i, 1);
    renderProdutosCfg();
    toast('Produto removido');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

function renderConcorrentesCfg() {
  el('lista-conc-cfg').innerHTML = _concorrentes.map((c, i) => {
    const prod = _produtos.find(p => p.id === c.produto_id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600">${prod?.nome || '—'}</div>
        <div style="font-size:11px;color:var(--text3)">${c.empresa_concorrente}: ${c.produto_similar}</div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removerConcorrente(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text3)">Nenhum similar cadastrado.</div>';
}

async function addConcorrente() {
  const pid     = el('nc-meu-produto').value;
  const empresa = el('nc-empresa').value.trim();
  const similar = el('nc-similar').value.trim();
  if (!pid || !empresa || !similar) { toast('Preencha todos os campos', 'red'); return; }
  try {
    const [conc] = await supa('similares_concorrentes', {
      method: 'POST',
      body: { empresa_id: _user.empresa_id, produto_id: pid, empresa_concorrente: empresa, produto_similar: similar }
    });
    _concorrentes.push(conc);
    el('nc-meu-produto').value = '';
    el('nc-empresa').value = '';
    el('nc-similar').value = '';
    renderConcorrentesCfg();
    toast('Similar adicionado!');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

async function removerConcorrente(i) {
  const c = _concorrentes[i];
  try {
    await supa(`similares_concorrentes?id=eq.${c.id}`, { method: 'DELETE' });
    _concorrentes.splice(i, 1);
    renderConcorrentesCfg();
    toast('Similar removido');
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

async function salvarPerfil() {
  const nome = el('cfg-nome').value.trim();
  const meta = parseFloat(el('cfg-meta').value) || 0;
  const real = parseFloat(el('cfg-realizado').value) || 0;
  if (!nome) { toast('Informe seu nome', 'red'); return; }
  try {
    await supa(`promotores?id=eq.${_user.id}`, { method: 'PATCH', body: { nome } });
    if (meta > 0) {
      await supa('desempenho', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: { empresa_id: _user.empresa_id, promotor_id: _user.id, periodo: anoMes(), meta, realizado: real }
      });
    }
    _user.nome = nome;
    localStorage.setItem('spdv_user', JSON.stringify(_user));
    toast('Perfil salvo!');
    atualizarHome();
  } catch(e) { toast('Erro: ' + e.message, 'red'); }
}

function previewMeta() {
  const meta = parseFloat(el('cfg-meta').value) || 0;
  const real = parseFloat(el('cfg-realizado').value) || 0;
  const pct  = meta > 0 ? (real / meta * 100).toFixed(0) : 0;
  const dias = diasUteisRestantes();
  const falta = Math.max(0, meta - real);
  if (meta > 0) {
    show('cfg-meta-preview');
    el('cfg-meta-dia').textContent = dias > 0 ? moeda(falta / dias) : '—';
    el('cfg-meta-pct').textContent = pct + '%';
    el('cfg-meta-bar').style.width = Math.min(100, pct) + '%';
  }
}

// ─── SELETOR DE LOJA ─────────────────────────
function abrirSeletorLoja() {
  const container = el('seletor-lojas');
  if (container.style.display !== 'none') { container.style.display = 'none'; return; }
  if (!_lojas.length) { toast('Cadastre lojas em Configurações', 'red'); return; }
  container.innerHTML = `<div class="lojas-dropdown">
    ${_lojas.map(l => `
      <div class="loja-option ${l.id === _lojaId ? 'selected' : ''}" onclick="selecionarLoja('${l.id}','${l.nome}')">
        ${l.nome}${l.rede ? ` <span style="font-size:10px;color:var(--text3)">· ${l.rede}</span>` : ''}
      </div>
    `).join('')}
  </div>`;
  container.style.display = 'block';
}

function selecionarLoja(id, nome) {
  _lojaId = id;
  localStorage.setItem('spdv_loja', id);
  el('loja-header').textContent = nome;
  el('seletor-lojas').style.display = 'none';
  // Atualiza labels de loja em todas as telas
  ['loja-est','loja-check','loja-conc','loja-av','loja-desemp','loja-op','loja-metas'].forEach(id => {
    if (el(id)) el(id).textContent = nome;
  });
  carregarResumoHome();
}

// ─── PONTUAÇÃO ───────────────────────────────
const TABELA_PONTOS = [
  { acao: 'Estoque salvo', pts: 10 },
  { acao: 'Checklist 100%', pts: 20 },
  { acao: 'Avaria registrada', pts: 8 },
  { acao: 'Preço concorrente', pts: 5 },
  { acao: 'Oportunidade registrada', pts: 6 },
];

const NIVEIS = [
  { nome: '🌱 Iniciante', min: 0 },
  { nome: '⭐ Bronze',    min: 100 },
  { nome: '🥈 Prata',     min: 300 },
  { nome: '🥇 Ouro',      min: 600 },
  { nome: '💎 Diamante',  min: 1000 },
];

async function registrarPontos(tipo, pts) {
  try {
    await supa('pontos_historico', {
      method: 'POST',
      body: {
        empresa_id: _user.empresa_id,
        promotor_id: _user.id,
        tipo, pontos: pts,
        data: dataHoje()
      }
    });
  } catch(e) { console.warn('Pontos:', e); }
}

async function carregarRanking() {
  const tabela = el('tabela-pontos');
  if (tabela) tabela.innerHTML = TABELA_PONTOS.map(p => `
    <div class="pontos-row">
      <span>${p.acao}</span>
      <span class="pontos-val">+${p.pts} pts</span>
    </div>
  `).join('');

  try {
    const periodo = _rankPeriodo === 'mes' ? anoMes() : semanaAtual();
    const rows = await supa(
      `pontos_ranking?empresa_id=eq.${_user.empresa_id}&periodo=eq.${periodo}&select=promotor_id,promotores(nome),total&order=total.desc`
    );
    if (el('rank-periodo-label')) el('rank-periodo-label').textContent = _rankPeriodo === 'mes' ? 'Ranking do mês' : 'Ranking da semana';

    if (!rows?.length) {
      el('lista-ranking').innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Nenhum dado ainda.</div>';
      return;
    }
    el('lista-ranking').innerHTML = rows.map((r, i) => {
      const isEu = r.promotor_id === _user.id;
      const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      if (isEu) {
        el('rank-meu-nome').textContent = r.promotores?.nome || '—';
        el('rank-meus-pts').textContent = r.total;
        el('rank-minha-posicao').textContent = '#' + (i + 1);
        const nivel = NIVEIS.slice().reverse().find(n => r.total >= n.min) || NIVEIS[0];
        const prox  = NIVEIS.find(n => n.min > r.total);
        if (el('rank-nivel-atual')) el('rank-nivel-atual').textContent = nivel.nome;
        if (el('rank-pts-prox')) el('rank-pts-prox').textContent = prox ? `${prox.min - r.total} pts para ${prox.nome}` : '🏆 Nível máximo!';
        if (el('rank-xp-bar')) el('rank-xp-bar').style.width = Math.min(100, (r.total - nivel.min) / ((prox?.min || nivel.min + 1000) - nivel.min) * 100) + '%';
        el('rank-meu-emoji').textContent = emoji || '⭐';
        if (el('home-meus-pts')) el('home-meus-pts').textContent = r.total;
        if (el('home-nivel-nome')) el('home-nivel-nome').textContent = nivel.nome;
        if (el('home-rank-pos')) el('home-rank-pos').textContent = `#${i + 1} no ranking`;
      }
      return `<div class="rank-item${isEu ? '" style="background:var(--brand-bg)' : ''}">
        <div class="rank-pos-num ${cls}">${emoji || '#' + (i + 1)}</div>
        <div class="rank-nome-item">${r.promotores?.nome || '—'}${isEu ? ' <span style="font-size:10px;color:var(--brand)">(você)</span>' : ''}</div>
        <div class="rank-pts-item">${r.total} pts</div>
      </div>`;
    }).join('');
  } catch(e) { console.warn('Ranking:', e); }
}

function setRankPeriodo(p) {
  _rankPeriodo = p;
  el('rank-btn-mes').style.fontWeight    = p === 'mes'    ? '700' : '400';
  el('rank-btn-semana').style.fontWeight = p === 'semana' ? '700' : '400';
  carregarRanking();
}

function salvarDataLancamento(v) { localStorage.setItem('spdv_data', v); }

// ─── RELÓGIO ─────────────────────────────────
function relogioTicker() {
  const tick = () => {
    const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    ['hclock','clk-est'].forEach(id => { if (el(id)) el(id).textContent = t; });
  };
  tick();
  setInterval(tick, 10000);
}

// ─── UTILITÁRIOS ─────────────────────────────
const el = id => document.getElementById(id);
const show = (id, d='block') => { const e = el(id); if (e) e.style.display = d; };
const hide = id => { const e = el(id); if (e) e.style.display = 'none'; };

function toast(msg, tipo = 'ok') {
  const t = el('toast');
  t.textContent = msg;
  t.style.background = tipo === 'red' ? 'var(--red)' : 'var(--text)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function moeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function dataHoje() {
  return new Date().toISOString().split('T')[0];
}

function anoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function semanaAtual() {
  const d = new Date();
  const ini = new Date(d);
  ini.setDate(d.getDate() - d.getDay());
  return ini.toISOString().split('T')[0];
}

function diasUteisDoMes() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let uteis = 0;
  for (let i = 1; i <= ultimo; i++) {
    const dia = new Date(d.getFullYear(), d.getMonth(), i).getDay();
    if (dia !== 0 && dia !== 6) uteis++;
  }
  return uteis;
}

function diasUteisRestantes() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let uteis = 0;
  for (let i = d.getDate() + 1; i <= ultimo; i++) {
    const dia = new Date(d.getFullYear(), d.getMonth(), i).getDay();
    if (dia !== 0 && dia !== 6) uteis++;
  }
  return uteis;
}

function maskCPF(v) {
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function nomeLojaAtual() {
  const l = _lojas.find(x => x.id === _lojaId);
  return l ? l.nome : 'Selecione uma loja';
}

// Restaurar loja salva
const lojaId = localStorage.getItem('spdv_loja');
if (lojaId) _lojaId = lojaId;
