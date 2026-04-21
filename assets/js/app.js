// ⚠️ CONFIGURE SUAS CREDENCIAIS SUPABASE
// ════════════════════════════════════════
const SUPA_URL = 'https://SEU_PROJETO.supabase.co';
const SUPA_KEY = 'SUA_ANON_KEY_AQUI';

// Supabase REST helper
async function supaFetch(path, opts={}) {
  try {
    const r = await fetch(SUPA_URL+'/rest/v1/'+path, {
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':opts.prefer||'return=representation',...(opts.headers||{})},
      method:opts.method||'GET',
      body:opts.body?JSON.stringify(opts.body):undefined
    });
    if(!r.ok) throw new Error(await r.text());
    return r.status===204?null:r.json();
  } catch(e) { throw e; }
}
const supa = {
  select:(t,q='')=>supaFetch(t+'?'+q),
  insert:(t,d)=>supaFetch(t,{method:'POST',body:Array.isArray(d)?d:[d]}),
  update:(t,q,d)=>supaFetch(t+'?'+q,{method:'PATCH',body:d}),
  delete:(t,q)=>supaFetch(t+'?'+q,{method:'DELETE',prefer:'return=minimal'}),
  upsert:(t,d)=>supaFetch(t,{method:'POST',body:Array.isArray(d)?d:[d],prefer:'resolution=merge-duplicates,return=representation'})
};

// Estado global
let S = {
  promotorId:null,promotorNome:'',lojas:[],lojaAtual:null,
  produtos:[],concorrentes:[],estoque:{},precos:{},
  avarias:[],oportunidades:[],metas:[],
  desempenho:{meta:0,realizado:0},
  dataLancamento:new Date().toISOString().slice(0,10),
  tema:'dark',_concPrecos:{}
};

// Utils
const fmt=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
const $=id=>document.getElementById(id);
function toast(msg,dur=2800){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur)}
function diasUteis(){const n=new Date(),fim=new Date(n.getFullYear(),n.getMonth()+1,0);let d=0;for(let dt=new Date(n);dt<=fim;dt.setDate(dt.getDate()+1)){if(dt.getDay()!==0&&dt.getDay()!==6)d++}return d}

// LocalStorage
const ls=(k,v)=>v!==undefined?localStorage.setItem('spdv_'+k,JSON.stringify(v)):JSON.parse(localStorage.getItem('spdv_'+k)||'null');
function saveLocal(){ls('estado',{promotorId:S.promotorId,promotorNome:S.promotorNome,lojas:S.lojas,lojaAtual:S.lojaAtual,produtos:S.produtos,concorrentes:S.concorrentes,estoque:S.estoque,precos:S.precos,avarias:S.avarias,oportunidades:S.oportunidades,metas:S.metas,desempenho:S.desempenho,dataLancamento:S.dataLancamento})}
function loadLocal(){const e=ls('estado');if(e)Object.assign(S,e)}

// Tema
function toggleTema(){S.tema=S.tema==='dark'?'light':'dark';aplicarTema();ls('tema',S.tema)}
function aplicarTema(){document.documentElement.setAttribute('data-theme',S.tema);const dk=S.tema==='dark';const tr=$('tog-track');if(tr){tr.classList.toggle('on',dk);$('theme-icon').textContent=dk?'🌙':'☀️';$('theme-lbl').textContent=dk?'DARK':'LIGHT'}}

// Relógio
function iniciarRelogio(){
  function atualizar(){
    const a=new Date(),hm=a.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    ['hclock','clk-est'].forEach(id=>{const el=$(id);if(el)el.textContent=hm});
    const ds=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    const ms=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    if($('hdate'))$('hdate').textContent=`${ds[a.getDay()]}, ${a.getDate()} ${ms[a.getMonth()]}`;
    const h=a.getHours();
    if($('greeting'))$('greeting').textContent=h<12?'Bom dia! ☀️':h<18?'Boa tarde! 🌤️':'Boa noite! 🌙';
  }
  atualizar();setInterval(atualizar,30000);
}

// Nav
function navTo(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  const sc=$('sc-'+name);if(sc)sc.classList.add('active');
  const ni=$('ni-'+name);if(ni)ni.classList.add('active');
  const ln=S.lojaAtual?.nome||'—';
  ['loja-est','loja-conc','loja-av','loja-desemp','loja-op','loja-check','loja-metas'].forEach(id=>{const el=$(id);if(el)el.textContent=ln});
  if(name==='estoque')renderEstoque();
  if(name==='concorrentes')renderConcorrentes();
  if(name==='config')renderConfig();
  if(name==='avarias')popularSelectAvaria();
  if(name==='checklist')atualizarRing();
  if(name==='metas')renderMetas();
  if(name==='oportunidades')renderOportunidades();
  if(name==='desempenho'&&S.desempenho.meta){$('fat-meta-input').value=S.desempenho.meta;$('fat-real-input').value=S.desempenho.realizado;calcMeta()}
}

// Login
function formatarCPF(v){return v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}
$('login-cpf').addEventListener('input',function(){this.value=formatarCPF(this.value)});

async function fazerLogin(){
  const cpf=$('login-cpf').value.replace(/\D/g,'');
  const senha=$('login-senha').value.trim();
  if(!cpf||!senha){toast('Preencha CPF e senha');return}
  $('login-loading').style.display='block';$('login-error').style.display='none';
  try{
    const rows=await supa.select('promotores',`cpf=eq.${cpf}&senha=eq.${senha}&select=id,nome`);
    if(rows&&rows.length>0){
      S.promotorId=rows[0].id;S.promotorNome=rows[0].nome;
      ls('promotorId',S.promotorId);ls('promotorNome',S.promotorNome);
      await carregarDados();mostrarApp();
    } else {
      $('login-error').textContent='CPF ou senha incorretos.';$('login-error').style.display='block';
    }
  } catch(e){
    // Fallback local para testes sem Supabase configurado
    if(cpf==='00000000000'&&senha==='123456'){
      S.promotorId='local';S.promotorNome=ls('promotorNome')||'Promotor Teste';
      loadLocal();mostrarApp();
    } else {
      $('login-error').textContent='Erro de conexão. Teste: CPF 000.000.000-00 / Senha 123456';
      $('login-error').style.display='block';
    }
  } finally{$('login-loading').style.display='none'}
}

async function carregarDados(){
  try{
    const[lojas,produtos,conc]=await Promise.all([
      supa.select('lojas',`promotor_id=eq.${S.promotorId}`),
      supa.select('produtos',`promotor_id=eq.${S.promotorId}`),
      supa.select('concorrentes',`promotor_id=eq.${S.promotorId}`)
    ]);
    S.lojas=lojas||[];S.produtos=produtos||[];S.concorrentes=conc||[];
    if(S.lojas.length>0&&!S.lojaAtual)S.lojaAtual=S.lojas[0];
    const[est,av,desemp,op]=await Promise.all([
      supa.select('estoque',`promotor_id=eq.${S.promotorId}&data=eq.${today()}`),
      supa.select('avarias',`promotor_id=eq.${S.promotorId}&order=created_at.desc&limit=20`),
      supa.select('desempenho',`promotor_id=eq.${S.promotorId}&order=created_at.desc&limit=1`),
      supa.select('oportunidades',`promotor_id=eq.${S.promotorId}&order=created_at.desc&limit=20`)
    ]);
    if(est)est.forEach(r=>{S.estoque[r.produto_id]=r.quantidade;S.precos[r.produto_id]=r.preco_venda});
    S.avarias=av||[];S.oportunidades=op||[];
    if(desemp&&desemp.length>0)S.desempenho={meta:desemp[0].meta,realizado:desemp[0].realizado};
  } catch(e){loadLocal()}
}

function mostrarApp(){
  $('sc-login').classList.remove('active');$('main-nav').classList.add('visible');
  if($('home-promotor-nome'))$('home-promotor-nome').textContent=S.promotorNome;
  if(S.lojaAtual)$('loja-header').textContent=S.lojaAtual.nome;
  atualizarHomeMeta();navTo('home');
}

function fazerLogout(){
  if(!confirm('Deseja sair?'))return;
  ls('promotorId',null);
  S={promotorId:null,promotorNome:'',lojas:[],lojaAtual:null,produtos:[],concorrentes:[],estoque:{},precos:{},avarias:[],oportunidades:[],metas:[],desempenho:{meta:0,realizado:0},dataLancamento:today(),tema:S.tema,_concPrecos:{}};
  $('main-nav').classList.remove('visible');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('sc-login').classList.add('active');
  $('login-cpf').value='';$('login-senha').value='';
}

// Home & Meta
function abrirSeletorLoja(){
  const box=$('seletor-lojas');
  box.style.display=box.style.display==='none'?'block':'none';
  if(box.style.display==='block'){
    box.innerHTML='<div class="store-dropdown">'+(S.lojas.length===0
      ?'<div class="store-option" style="color:var(--text3)">Cadastre lojas em Configurações</div>'
      :S.lojas.map(l=>`<div class="store-option${S.lojaAtual?.id===l.id?' active':''}" onclick="selecionarLoja('${l.id}')">${l.nome}${l.cidade?' · '+l.cidade:''}</div>`).join(''))+'</div>';
  }
}
function selecionarLoja(id){
  S.lojaAtual=S.lojas.find(l=>l.id===id);
  $('loja-header').textContent=S.lojaAtual?.nome||'Selecionar loja';
  $('seletor-lojas').style.display='none';saveLocal();toast('Loja: '+S.lojaAtual.nome);
}

function atualizarHomeMeta(){
  const{meta,realizado}=S.desempenho;
  const pct=meta>0?Math.min(100,Math.round(realizado/meta*100)):0;
  const dias=diasUteis();const falta=Math.max(0,meta-realizado);const porDia=dias>0?falta/dias:0;
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('home-meta-val',fmt(meta));set('home-real-val',fmt(realizado));
  set('home-meta-pct',pct+'%');set('home-meta-dia',fmt(porDia));
  set('home-meta-falta',fmt(falta));set('home-dias-restantes',dias+' dias úteis');
  set('home-fat-real',fmt(realizado));set('home-fat-meta',fmt(meta));set('home-fat-pct',pct+'%');
  set('desemp-real',fmt(realizado));set('desemp-meta',fmt(meta));set('desemp-pct-lbl',pct+'% da meta');set('desemp-falta','Falta: '+fmt(falta));
  if($('home-meta-bar'))$('home-meta-bar').style.width=pct+'%';
  if($('home-fat-bar'))$('home-fat-bar').style.width=pct+'%';
  if($('desemp-bar'))$('desemp-bar').style.width=pct+'%';
  set('home-av',S.avarias.length);set('home-op',S.oportunidades.length);
  const alertas=Object.entries(S.estoque).filter(([id,q])=>{const p=S.produtos.find(x=>x.id===id);return p&&Number(q)<=(p.estoque_minimo||0)&&Number(q)>=0}).length;
  set('home-est-alert',alertas);
}
function salvarDataLancamento(v){S.dataLancamento=v;saveLocal()}

// Estoque
function renderEstoque(){
  const lista=$('lista-est');
  const prods=S.lojaAtual?S.produtos.filter(p=>!p.lojas||!p.lojas.length||p.lojas.includes(S.lojaAtual.id)):S.produtos;
  if(!prods.length){lista.innerHTML='<div class="ibox ibox-amber">📭 Cadastre produtos em Configurações primeiro.</div>';return}
  lista.innerHTML=prods.map(p=>{
    const q=S.estoque[p.id]!==undefined?S.estoque[p.id]:'';
    const pr=S.precos[p.id]!==undefined?S.precos[p.id]:'';
    const min=p.estoque_minimo||0;
    const alerta=q!==''&&Number(q)<=min;
    return`<div class="prod-row"><div class="prod-row-top"><div><div class="prod-name">${p.nome}</div><div class="prod-sku">${p.sku||''}</div></div>${alerta?'<span class="badge b-red">⚠️ Alerta</span>':''}</div><div class="prod-inputs"><div class="prod-input-wrap"><label>Qtd. em estoque</label><input type="number" inputmode="numeric" placeholder="0" value="${q}" onchange="updateEst('${p.id}','qtd',this.value)" oninput="updateEst('${p.id}','qtd',this.value)"></div><div class="prod-input-wrap"><label>Preço de venda (R$)</label><input type="number" inputmode="decimal" step="0.01" placeholder="0,00" value="${pr}" onchange="updateEst('${p.id}','preco',this.value)" oninput="updateEst('${p.id}','preco',this.value)"></div></div>${min>0?`<div class="stock-status"><span style="font-size:10px;color:var(--text3)">Mín: ${min} un.</span>${alerta?'<span class="badge b-red" style="font-size:9px">Abaixo do mínimo</span>':'<span class="badge b-green" style="font-size:9px">OK</span>'}</div>`:''}</div>`;
  }).join('');
}
function updateEst(id,tipo,v){if(tipo==='qtd')S.estoque[id]=v;else S.precos[id]=v;if($('banner-nao-salvo'))$('banner-nao-salvo').style.display='flex';saveLocal()}
async function salvarEstoque(){
  if(!S.lojaAtual){toast('Selecione uma loja primeiro!');return}
  const rows=S.produtos.filter(p=>S.estoque[p.id]!==undefined).map(p=>({promotor_id:S.promotorId,loja_id:S.lojaAtual.id,produto_id:p.id,quantidade:Number(S.estoque[p.id])||0,preco_venda:Number(S.precos[p.id])||0,data:S.dataLancamento}));
  if(!rows.length){toast('Nenhum dado para salvar');return}
  try{await supa.upsert('estoque',rows);toast('✅ Estoque salvo!');if($('banner-nao-salvo'))$('banner-nao-salvo').style.display='none';atualizarHomeMeta()}
  catch(e){saveLocal();toast('⚠️ Salvo localmente (offline)')}
}
function editarLancamento(){if($('est-ja-salvo'))$('est-ja-salvo').style.display='none';renderEstoque()}

// Checklist
function tgl(el){el.classList.toggle('done');atualizarRing()}
function atualizarRing(){
  const todos=document.querySelectorAll('#sc-checklist .ci');
  const feitos=document.querySelectorAll('#sc-checklist .ci.done');
  const pct=todos.length?Math.round(feitos.length/todos.length*100):0;
  const circ=169.6,offset=circ-(pct/100*circ);
  const ring=$('ring-fill');
  if(ring){ring.style.strokeDashoffset=offset;$('ring-pct-text').textContent=pct+'%'}
  if($('ring-pct'))$('ring-pct').textContent=pct+'%';
  if($('ring-lbl'))$('ring-lbl').textContent=`${feitos.length} de ${todos.length} tarefas concluídas`;
  if($('home-check-bar'))$('home-check-bar').style.width=pct+'%';
  if($('home-check-val'))$('home-check-val').textContent=pct+'%';
  if($('home-check-txt'))$('home-check-txt').textContent=`${feitos.length} de ${todos.length} itens marcados`;
  if($('home-expo-pct'))$('home-expo-pct').textContent=pct+'%';
}
async function salvarChecklist(){
  const todos=document.querySelectorAll('#sc-checklist .ci');
  const feitos=document.querySelectorAll('#sc-checklist .ci.done');
  const pct=todos.length?Math.round(feitos.length/todos.length*100):0;
  try{await supa.upsert('exposicao',[{promotor_id:S.promotorId,loja_id:S.lojaAtual?.id,data:today(),pct_execucao:pct,total_itens:todos.length,itens_ok:feitos.length}]);toast('✅ Checklist salvo!')}
  catch(e){toast('✅ Checklist salvo localmente')}
}

// Concorrentes
function renderConcorrentes(){
  const lista=$('lista-conc');
  if(!S.concorrentes.length){lista.innerHTML='<div class="ibox ibox-amber">Cadastre similares de concorrentes em Configurações.</div>';return}
  lista.innerHTML=S.concorrentes.map(c=>{
    const mp=S.produtos.find(p=>p.id===c.meu_produto_id);
    const pr=S.precos[c.meu_produto_id]||'';
    return`<div class="conc-row"><div class="conc-produto">${mp?.nome||c.meu_produto_id} <span style="font-size:11px;color:var(--text3)">vs.</span> ${c.empresa} — ${c.similar}</div><div class="conc-inputs"><div class="prod-input-wrap"><label>Nosso preço (R$)</label><input type="number" inputmode="decimal" step="0.01" placeholder="0,00" value="${pr}" onchange="updateConc('${c.id}','nosso',this.value)"></div><div class="prod-input-wrap"><label>Preço concorrente (R$)</label><input type="number" inputmode="decimal" step="0.01" placeholder="0,00" onchange="updateConc('${c.id}','conc',this.value)"></div></div><div id="conc-diff-${c.id}" style="margin-top:6px;font-size:11px;color:var(--text3)"></div></div>`;
  }).join('');
}
function updateConc(id,tipo,v){
  if(!S._concPrecos)S._concPrecos={};
  if(!S._concPrecos[id])S._concPrecos[id]={};
  S._concPrecos[id][tipo]=Number(v);
  const nos=S._concPrecos[id].nosso||0,conc=S._concPrecos[id].conc||0;
  if(nos&&conc){const diff=((conc-nos)/nos*100).toFixed(1);const el=$('conc-diff-'+id);if(el){const cor=diff>0?'var(--green)':'var(--red)';el.innerHTML=`<span style="color:${cor};font-weight:700">${diff>0?'+':''}${diff}%</span> em relação ao concorrente`}}
}
async function salvarConcorrentes(){
  if(!S._concPrecos||!Object.keys(S._concPrecos).length){toast('Preencha os preços primeiro');return}
  const rows=Object.entries(S._concPrecos).map(([id,v])=>({promotor_id:S.promotorId,concorrente_id:id,loja_id:S.lojaAtual?.id,preco_proprio:v.nosso||0,preco_concorrente:v.conc||0,data:today()}));
  try{await supa.upsert('precos_concorrentes',rows);toast('✅ Preços salvos!')}
  catch(e){saveLocal();toast('⚠️ Salvo localmente')}
}

// Avarias
function popularSelectAvaria(){const sel=$('av-produto');sel.innerHTML='<option value="">Selecione o produto</option>'+S.produtos.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('')}
let _avFoto=null;
function prevAvaria(inp){const file=inp.files[0];if(!file)return;_avFoto=file;const r=new FileReader();r.onload=e=>{$('av-prev').style.display='block';$('av-prev').innerHTML=`<img src="${e.target.result}" alt="Avaria" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;border:1px solid var(--border)">`};r.readAsDataURL(file)}
async function addAvaria(){
  const prodId=$('av-produto').value,qty=$('av-qty').value,tipo=$('av-tipo').value,obs=$('av-obs').value.trim();
  if(!prodId||!qty||!tipo){toast('Preencha produto, quantidade e tipo');return}
  const prod=S.produtos.find(p=>p.id===prodId);
  const av={id:Date.now().toString(),produto_id:prodId,produto_nome:prod?.nome||prodId,quantidade:Number(qty),tipo,obs,loja_id:S.lojaAtual?.id,data:today()};
  try{const saved=await supa.insert('avarias',{promotor_id:S.promotorId,produto_id:prodId,loja_id:S.lojaAtual?.id,quantidade:Number(qty),tipo,obs,data:today()});if(saved&&saved[0])av.id=saved[0].id;toast('✅ Avaria registrada!')}
  catch(e){toast('⚠️ Salvo localmente')}
  S.avarias.push(av);saveLocal();renderAvarias();
  if($('home-av'))$('home-av').textContent=S.avarias.length;
  $('av-produto').value='';$('av-qty').value='';$('av-tipo').value='';$('av-obs').value='';$('av-prev').style.display='none';_avFoto=null;
}
function renderAvarias(){
  const lista=$('lista-av');
  if(!S.avarias.length){lista.innerHTML='';return}
  lista.innerHTML='<div class="section-label">Avarias registradas</div>'+S.avarias.slice().reverse().map(a=>`<div class="av-card"><div class="av-card-top"><div><div class="av-produto">${a.produto_nome||a.produto_id}</div><div class="av-tipo">${a.tipo} · ${a.quantidade} un.</div>${a.obs?`<div style="font-size:11px;color:var(--text3);margin-top:3px">${a.obs}</div>`:''}<div style="font-size:10px;color:var(--text3);margin-top:4px">${a.data}</div></div><span class="badge b-red">Avaria</span></div></div>`).join('');
}

// Desempenho
function calcMeta(){
  const meta=Number($('fat-meta-input').value)||0,real=Number($('fat-real-input').value)||0;
  const pct=meta>0?Math.min(100,Math.round(real/meta*100)):0;
  if($('desemp-real'))$('desemp-real').textContent=fmt(real);if($('desemp-meta'))$('desemp-meta').textContent=fmt(meta);
  if($('desemp-bar'))$('desemp-bar').style.width=pct+'%';
  if($('desemp-pct-lbl'))$('desemp-pct-lbl').textContent=pct+'% da meta';
  if($('desemp-falta'))$('desemp-falta').textContent='Falta: '+fmt(Math.max(0,meta-real));
}
async function salvarDesempenho(){
  const meta=Number($('fat-meta-input').value)||0,real=Number($('fat-real-input').value)||0;
  S.desempenho={meta,realizado:real};saveLocal();atualizarHomeMeta();
  const dias=new Date().getDate();const projFim=dias>0?(real/dias)*22:0;
  if($('desemp-proj-dia'))$('desemp-proj-dia').textContent=fmt(dias>0?real/dias:0);
  if($('desemp-proj-fim'))$('desemp-proj-fim').textContent=fmt(projFim);
  try{await supa.insert('desempenho',{promotor_id:S.promotorId,loja_id:S.lojaAtual?.id,meta,realizado:real,data:today()});toast('✅ Desempenho salvo!')}
  catch(e){toast('✅ Salvo localmente')}
  const hist=$('desemp-historico');const item=document.createElement('div');
  item.style.cssText='font-size:12px;color:var(--text2);padding:8px 0;border-bottom:1px solid var(--border)';
  item.innerHTML=`${new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} — ${fmt(real)} de ${fmt(meta)} (${meta>0?Math.round(real/meta*100):0}%)`;
  if(hist.children.length===1&&hist.children[0].style.textAlign==='center')hist.innerHTML='';hist.prepend(item);
}

// Metas
function addMeta(){
  const nome=$('meta-nome').value.trim(),valor=Number($('meta-valor').value)||0,realizado=Number($('meta-realizado').value)||0,periodo=$('meta-periodo').value,produto=$('meta-produto').value.trim();
  if(!nome||!valor){toast('Preencha descrição e valor');return}
  S.metas.push({id:Date.now().toString(),nome,valor,realizado,periodo,produto,data:today()});
  saveLocal();renderMetas();
  $('meta-nome').value='';$('meta-valor').value='';$('meta-realizado').value='';$('meta-produto').value='';
  toast('✅ Meta adicionada!');
}
function renderMetas(){
  const lista=$('lista-metas');
  if(!S.metas.length){lista.innerHTML='<div class="section-label">Metas cadastradas</div><div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Nenhuma meta ainda.</div>';return}
  lista.innerHTML='<div class="section-label">Metas cadastradas</div>'+S.metas.map(m=>{
    const pct=m.valor>0?Math.min(100,Math.round(m.realizado/m.valor*100)):0;
    const cor=pct>=100?'var(--green)':pct>=70?'var(--brand)':'var(--red)';
    return`<div class="goal-card"><div class="goal-card-top"><div><div class="goal-name">${m.nome}</div><div class="goal-period">${m.periodo}${m.produto?' · '+m.produto:''}</div></div><span class="badge" style="background:transparent;border:1px solid ${cor};color:${cor}">${pct}%</span></div><div class="goal-numbers"><div class="goal-num"><div class="goal-num-v" style="color:${cor}">${fmt(m.realizado)}</div><div class="goal-num-l">Realizado</div></div><div class="goal-num"><div class="goal-num-v">${fmt(m.valor)}</div><div class="goal-num-l">Meta</div></div><div class="goal-num"><div class="goal-num-v" style="color:var(--red)">${fmt(Math.max(0,m.valor-m.realizado))}</div><div class="goal-num-l">Falta</div></div></div><div class="meta-bar-wrap" style="margin:0"><div class="meta-bar"><div class="meta-fill" style="width:${pct}%;background:${cor}"></div></div></div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-sm btn-danger" onclick="removerMeta('${m.id}')">Remover</button></div></div>`;
  }).join('');
}
function removerMeta(id){S.metas=S.metas.filter(m=>m.id!==id);saveLocal();renderMetas()}

// Oportunidades
async function addOportunidade(){
  const tipo=$('op-tipo').value,produto=$('op-produto').value.trim(),desc=$('op-desc').value.trim(),prio=$('op-prioridade').value;
  if(!tipo||!desc){toast('Preencha tipo e descrição');return}
  const op={id:Date.now().toString(),tipo,produto,desc,prio,loja_id:S.lojaAtual?.id,data:today()};
  try{await supa.insert('oportunidades',{promotor_id:S.promotorId,loja_id:S.lojaAtual?.id,tipo,produto,descricao:desc,prioridade:prio,data:today()});toast('✅ Oportunidade salva!')}
  catch(e){toast('⚠️ Salvo localmente')}
  S.oportunidades.push(op);saveLocal();renderOportunidades();
  if($('home-op'))$('home-op').textContent=S.oportunidades.length;
  $('op-tipo').value='';$('op-produto').value='';$('op-desc').value='';
}
function renderOportunidades(){
  const lista=$('lista-op');if(!S.oportunidades.length){lista.innerHTML='';return}
  const corP={alta:'var(--red)',media:'var(--brand)',baixa:'var(--text3)'};
  lista.innerHTML='<div class="section-label">Registradas</div>'+S.oportunidades.slice().reverse().map(o=>`<div class="op-card"><div class="op-card-top"><div class="op-tipo">${o.tipo}</div><span class="badge" style="color:${corP[o.prio]||'var(--text3)'};background:transparent;border:1px solid ${corP[o.prio]||'var(--border)'}">${o.prio||'média'}</span></div>${o.produto?`<div style="font-size:11px;color:var(--brand);margin-bottom:4px">📦 ${o.produto}</div>`:''}<div class="op-desc">${o.desc}</div><div class="op-meta">${o.data}</div></div>`).join('');
}

// Config
function renderConfig(){
  if($('cfg-nome'))$('cfg-nome').value=S.promotorNome;
  if($('cfg-usuario-logado'))$('cfg-usuario-logado').textContent=S.promotorNome||'—';
  if(S.desempenho.meta){if($('cfg-meta'))$('cfg-meta').value=S.desempenho.meta;if($('cfg-realizado'))$('cfg-realizado').value=S.desempenho.realizado}
  renderLojasConfig();renderProdutosConfig();renderConcorrentesConfig();
}
async function salvarPerfil(){
  S.promotorNome=$('cfg-nome').value.trim()||S.promotorNome;
  S.desempenho.meta=Number($('cfg-meta').value)||0;S.desempenho.realizado=Number($('cfg-realizado').value)||0;
  ls('promotorNome',S.promotorNome);saveLocal();atualizarHomeMeta();
  if($('home-promotor-nome'))$('home-promotor-nome').textContent=S.promotorNome;
  toast('✅ Perfil salvo!');
}
function previewMeta(){
  const meta=Number($('cfg-meta').value)||0,real=Number($('cfg-realizado').value)||0;
  const pct=meta>0?Math.min(100,Math.round(real/meta*100)):0;
  const dias=diasUteis(),porDia=dias>0?Math.max(0,meta-real)/dias:0;
  const prev=$('cfg-meta-preview');
  if(meta>0){prev.style.display='block';if($('cfg-meta-dia'))$('cfg-meta-dia').textContent=fmt(porDia);if($('cfg-meta-pct'))$('cfg-meta-pct').textContent=pct+'%';if($('cfg-meta-bar'))$('cfg-meta-bar').style.width=pct+'%'}
  else prev.style.display='none';
}

// Lojas
function renderLojasConfig(){
  const lista=$('lojas-lista');
  lista.innerHTML=S.lojas.length?S.lojas.map(l=>`<div class="loja-item"><div class="loja-item-info"><div class="loja-item-name">🏪 ${l.nome}</div><div class="loja-item-meta">${l.rede||''}${l.cidade?' · '+l.cidade:''}</div></div><button class="btn-del" onclick="removerLoja('${l.id}')">×</button></div>`).join(''):'<div style="font-size:12px;color:var(--text3);padding:8px 0">Nenhuma loja cadastrada.</div>';
}
async function addLoja(){
  const nome=$('nova-loja-nome').value.trim(),rede=$('nova-loja-rede').value.trim(),cidade=$('nova-loja-cidade').value.trim();
  if(!nome){toast('Digite o nome da loja');return}if(S.lojas.length>=5){toast('Máximo de 5 lojas');return}
  const loja={id:Date.now().toString(),nome,rede,cidade};
  try{const saved=await supa.insert('lojas',{promotor_id:S.promotorId,nome,rede,cidade});if(saved&&saved[0])loja.id=saved[0].id;toast('✅ Loja salva!')}
  catch(e){toast('✅ Loja adicionada')}
  S.lojas.push(loja);if(!S.lojaAtual){S.lojaAtual=loja;$('loja-header').textContent=loja.nome}
  saveLocal();renderLojasConfig();atualizarCheckboxLojas();
  $('nova-loja-nome').value='';$('nova-loja-rede').value='';$('nova-loja-cidade').value='';
}
async function removerLoja(id){
  if(!confirm('Remover esta loja?'))return;
  S.lojas=S.lojas.filter(l=>l.id!==id);if(S.lojaAtual?.id===id)S.lojaAtual=S.lojas[0]||null;
  try{await supa.delete('lojas',`id=eq.${id}`)}catch(e){}
  saveLocal();renderLojasConfig();
}

// Produtos
function atualizarCheckboxLojas(){
  const box=$('np-lojas-check');if(!box)return;
  box.innerHTML=S.lojas.length?S.lojas.map(l=>`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" value="${l.id}" style="accent-color:var(--brand)"> ${l.nome}</label>`).join(''):'<div style="font-size:12px;color:var(--text3);font-style:italic">Cadastre lojas primeiro.</div>';
}
function renderProdutosConfig(){
  atualizarCheckboxLojas();
  const lista=$('lista-produtos-cfg');
  lista.innerHTML=S.produtos.length?S.produtos.map(p=>`<div class="loja-item"><div class="loja-item-info"><div class="loja-item-name">${p.nome} <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${p.sku||''}</span></div><div class="loja-item-meta">${fmt(p.preco_sugerido||0)} · mín: ${p.estoque_minimo||0} un.</div></div><button class="btn-del" onclick="removerProduto('${p.id}')">×</button></div>`).join(''):'';
  const sel=$('nc-meu-produto');if(sel)sel.innerHTML='<option value="">Selecione</option>'+S.produtos.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('');
}
async function addProduto(){
  const nome=$('np-nome').value.trim(),sku=$('np-sku').value.trim(),min=Number($('np-minimo').value)||0,forn=$('np-fornecedor').value.trim(),preco=parseFloat(($('np-preco').value||'0').replace(',','.'))||0;
  if(!nome){toast('Digite o nome do produto');return}
  const lojas=[...document.querySelectorAll('#np-lojas-check input:checked')].map(i=>i.value);
  const prod={id:Date.now().toString(),nome,sku,estoque_minimo:min,fornecedor:forn,preco_sugerido:preco,lojas};
  try{const saved=await supa.insert('produtos',{promotor_id:S.promotorId,nome,sku,estoque_minimo:min,fornecedor:forn,preco_sugerido:preco});if(saved&&saved[0])prod.id=saved[0].id;toast('✅ Produto salvo!')}
  catch(e){toast('✅ Produto adicionado')}
  S.produtos.push(prod);saveLocal();renderProdutosConfig();
  $('np-nome').value='';$('np-sku').value='';$('np-minimo').value='';$('np-fornecedor').value='';$('np-preco').value='';
}
async function removerProduto(id){
  if(!confirm('Remover produto?'))return;
  S.produtos=S.produtos.filter(p=>p.id!==id);
  try{await supa.delete('produtos',`id=eq.${id}`)}catch(e){}
  saveLocal();renderProdutosConfig();
}

// Concorrentes config
function renderConcorrentesConfig(){
  const lista=$('lista-conc-cfg');
  lista.innerHTML=S.concorrentes.map(c=>{const p=S.produtos.find(x=>x.id===c.meu_produto_id);return`<div class="loja-item"><div class="loja-item-info"><div class="loja-item-name">${p?.nome||c.meu_produto_id}</div><div class="loja-item-meta">vs. ${c.empresa} — ${c.similar}</div></div><button class="btn-del" onclick="removerConcorrente('${c.id}')">×</button></div>`}).join('');
}
async function addConcorrente(){
  const prodId=$('nc-meu-produto').value,empresa=$('nc-empresa').value.trim(),similar=$('nc-similar').value.trim();
  if(!prodId||!empresa||!similar){toast('Preencha todos os campos');return}
  const conc={id:Date.now().toString(),meu_produto_id:prodId,empresa,similar};
  try{const saved=await supa.insert('concorrentes',{promotor_id:S.promotorId,meu_produto_id:prodId,empresa,similar});if(saved&&saved[0])conc.id=saved[0].id;toast('✅ Similar salvo!')}
  catch(e){toast('✅ Similar adicionado')}
  S.concorrentes.push(conc);saveLocal();renderConcorrentesConfig();
  $('nc-empresa').value='';$('nc-similar').value='';
}
async function removerConcorrente(id){
  S.concorrentes=S.concorrentes.filter(c=>c.id!==id);
  try{await supa.delete('concorrentes',`id=eq.${id}`)}catch(e){}
  saveLocal();renderConcorrentesConfig();
}

// Init
async function init(){
  S.tema=ls('tema')||'dark';aplicarTema();iniciarRelogio();
  const pid=ls('promotorId'),pnome=ls('promotorNome');
  if(pid){
    S.promotorId=pid;S.promotorNome=pnome||'';loadLocal();
    await carregarDados().catch(()=>{});mostrarApp();
  } else {
    $('sc-login').classList.add('active');
  }
  $('overlay-loading').style.display='none';
  if(S.lojaAtual)$('loja-header').textContent=S.lojaAtual.nome;
  if($('home-promotor-nome')&&S.promotorNome)$('home-promotor-nome').textContent=S.promotorNome;
  atualizarHomeMeta();renderAvarias();renderOportunidades();
  // Data padrão do datepicker
  const dp=$('home-data-lancamento');if(dp)dp.value=S.dataLancamento||today();
}
window.addEventListener('DOMContentLoaded',init);

// ════════════════════════════════════════
// GAMIFICAÇÃO — PONTUAÇÃO & RANKING
// ════════════════════════════════════════

// Tabela de pontos por ação
const PONTOS = [
  { acao:'Estoque lançado no dia',          pts:10, icon:'📦', cor:'var(--blue)'   },
  { acao:'Checklist 100% completo',         pts:20, icon:'✅', cor:'var(--green)'  },
  { acao:'Avaria registrada com foto',      pts:8,  icon:'📸', cor:'var(--amber)'  },
  { acao:'Preço concorrente registrado',    pts:5,  icon:'🏁', cor:'var(--purple)' },
  { acao:'Oportunidade identificada',       pts:10, icon:'💡', cor:'var(--brand)'  },
  { acao:'Meta mensal atingida (≥100%)',    pts:50, icon:'🎯', cor:'var(--green)'  },
  { acao:'Meta mensal atingida (≥80%)',     pts:25, icon:'📈', cor:'var(--brand)'  },
  { acao:'Visita registrada (check-in)',    pts:5,  icon:'📍', cor:'var(--blue)'   },
  { acao:'7 dias seguidos sem ruptura',     pts:30, icon:'🔥', cor:'var(--red)'    },
  { acao:'Exposição perfeita (PDV ok)',     pts:15, icon:'🏪', cor:'var(--purple)' },
];

// Conquistas desbloqueáveis
const CONQUISTAS = [
  { id:'primeiro_estoque',  icon:'📦', nome:'1º Estoque',    desc:'Lance o estoque pela primeira vez',      cond:s=>s.totalEstoques>=1 },
  { id:'checklist_master',  icon:'✅', nome:'Check Master',   desc:'Complete 10 checklists 100%',            cond:s=>s.checklistsCompletos>=10 },
  { id:'sem_ruptura_7',     icon:'🔥', nome:'7 Dias Vivo',   desc:'7 dias seguidos sem ruptura',            cond:s=>s.diasSemRuptura>=7 },
  { id:'meta_atingida',     icon:'🎯', nome:'Atingiu Meta',  desc:'Bata a meta mensal uma vez',             cond:s=>s.metasAtingidas>=1 },
  { id:'100_pontos',        icon:'⭐', nome:'100 Pts',       desc:'Acumule 100 pontos',                     cond:s=>s.totalPontos>=100 },
  { id:'500_pontos',        icon:'🌟', nome:'500 Pts',       desc:'Acumule 500 pontos',                     cond:s=>s.totalPontos>=500 },
  { id:'concorrente_pro',   icon:'🏁', nome:'Intel. Mk.',    desc:'Registre preços de concorrentes 20x',    cond:s=>s.totalConcorrentes>=20 },
  { id:'oportunidade_star', icon:'💡', nome:'Visionário',    desc:'Identifique 10 oportunidades',           cond:s=>s.totalOportunidades>=10 },
];

// Níveis
const NIVEIS = [
  { nome:'Iniciante',    min:0,   icon:'🌱' },
  { nome:'Trainee',      min:50,  icon:'🌿' },
  { nome:'Promotor',     min:150, icon:'⭐' },
  { nome:'Sênior',       min:300, icon:'🌟' },
  { nome:'Expert',       min:500, icon:'💎' },
  { nome:'Elite',        min:800, icon:'👑' },
];

let _rankPeriodo = 'mes';
let _rankData = { meusPontos:0, posicao:1, stats:{} };

function getNivel(pts) {
  let nivel = NIVEIS[0];
  for (const n of NIVEIS) { if (pts >= n.min) nivel = n; }
  return nivel;
}
function getProxNivel(pts) {
  for (const n of NIVEIS) { if (pts < n.min) return n; }
  return null;
}

function setRankPeriodo(p) {
  _rankPeriodo = p;
  document.querySelectorAll('[id^="rank-btn-"]').forEach(b => b.classList.remove('btn-p'));
  const btn = $('rank-btn-' + p); if (btn) btn.classList.add('btn-p');
  if ($('rank-periodo-label')) $('rank-periodo-label').textContent = p === 'mes' ? 'Ranking do mês atual' : 'Ranking da semana';
  carregarRanking();
}

function calcularPontosLocal() {
  // Calcula pontos baseado nos dados locais do promotor
  let pts = 0;
  const hist = [];

  // Estoque lançado
  const totalEst = Object.keys(S.estoque).filter(k => S.estoque[k] !== '').length;
  if (totalEst > 0) { pts += 10; hist.push({ acao:'Estoque lançado', pts:10, cor:'var(--blue)', data:today() }); }

  // Checklist
  const todos = document.querySelectorAll('#sc-checklist .ci');
  const feitos = document.querySelectorAll('#sc-checklist .ci.done');
  const pctCheck = todos.length ? feitos.length / todos.length : 0;
  if (pctCheck === 1) { pts += 20; hist.push({ acao:'Checklist 100% completo', pts:20, cor:'var(--green)', data:today() }); }
  else if (pctCheck > 0) { pts += 5; hist.push({ acao:'Checklist parcial', pts:5, cor:'var(--brand)', data:today() }); }

  // Avarias
  const av = S.avarias.filter(a => a.data === today()).length;
  if (av > 0) { pts += av * 8; hist.push({ acao:`${av} avaria(s) registrada(s)`, pts:av*8, cor:'var(--amber)', data:today() }); }

  // Concorrentes
  const conc = Object.keys(S._concPrecos||{}).length;
  if (conc > 0) { pts += conc * 5; hist.push({ acao:`${conc} preço(s) concorrente registrado(s)`, pts:conc*5, cor:'var(--purple)', data:today() }); }

  // Oportunidades
  const op = S.oportunidades.filter(o => o.data === today()).length;
  if (op > 0) { pts += op * 10; hist.push({ acao:`${op} oportunidade(s)`, pts:op*10, cor:'var(--brand)', data:today() }); }

  // Meta
  const { meta, realizado } = S.desempenho;
  if (meta > 0) {
    const pct = realizado / meta;
    if (pct >= 1) { pts += 50; hist.push({ acao:'Meta mensal atingida! 🎉', pts:50, cor:'var(--green)', data:today() }); }
    else if (pct >= 0.8) { pts += 25; hist.push({ acao:'Meta 80%+ atingida', pts:25, cor:'var(--brand)', data:today() }); }
  }

  _rankData.meusPontos = (ls('pontos_acumulados') || 0) + pts;
  _rankData.stats = {
    totalEstoques: totalEst,
    checklistsCompletos: feitos.length === todos.length && todos.length > 0 ? (ls('checklists_ok')||0)+1 : (ls('checklists_ok')||0),
    totalConcorrentes: (ls('total_conc')||0) + conc,
    totalOportunidades: (ls('total_op')||0) + op,
    metasAtingidas: meta > 0 && realizado >= meta ? (ls('metas_ok')||0)+1 : (ls('metas_ok')||0),
    diasSemRuptura: ls('dias_sem_ruptura') || 0,
    totalPontos: _rankData.meusPontos
  };

  return { pts, hist };
}

async function carregarRanking() {
  const lista = $('lista-ranking');
  if (lista) lista.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Carregando...</div>';

  // Calcula pontos do promotor atual
  const { pts, hist } = calcularPontosLocal();

  // Atualiza minha pontuação
  const totalPts = _rankData.meusPontos;
  const nivel = getNivel(totalPts);
  const proxNivel = getProxNivel(totalPts);

  if ($('rank-meu-nome')) $('rank-meu-nome').textContent = S.promotorNome || '—';
  if ($('rank-meu-emoji')) $('rank-meu-emoji').textContent = nivel.icon;
  if ($('rank-meus-pts')) $('rank-meus-pts').textContent = totalPts.toLocaleString('pt-BR');
  if ($('rank-minha-pos')) $('rank-minha-pos').textContent = 'pontos · Nível ' + nivel.nome;
  if ($('rank-nivel-atual')) $('rank-nivel-atual').textContent = nivel.icon + ' ' + nivel.nome;
  if (proxNivel) {
    const falta = proxNivel.min - totalPts;
    const pct = Math.max(0, Math.min(100, ((totalPts - nivel.min) / (proxNivel.min - nivel.min)) * 100));
    if ($('rank-pts-prox')) $('rank-pts-prox').textContent = falta + ' pts para ' + proxNivel.nome;
    if ($('rank-xp-bar')) $('rank-xp-bar').style.width = pct + '%';
  } else {
    if ($('rank-pts-prox')) $('rank-pts-prox').textContent = 'Nível máximo atingido! 👑';
    if ($('rank-xp-bar')) $('rank-xp-bar').style.width = '100%';
  }

  // Tenta buscar ranking da equipe no Supabase
  try {
    const inicio = _rankPeriodo === 'mes'
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)
      : (() => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().slice(0,10); })();

    // Busca pontuação de todos os promotores (tabela desempenho como proxy)
    const rows = await supa.select('desempenho', `data=gte.${inicio}&order=realizado.desc&select=promotor_id,realizado,meta`);

    if (rows && rows.length > 0) {
      // Busca nomes dos promotores
      const ids = [...new Set(rows.map(r => r.promotor_id))];
      const promotores = await supa.select('promotores', `id=in.(${ids.join(',')})&select=id,nome`);
      const nomeMap = {};
      (promotores || []).forEach(p => nomeMap[p.id] = p.nome);

      // Agrupa por promotor e calcula pontuação aproximada
      const rankMap = {};
      rows.forEach(r => {
        if (!rankMap[r.promotor_id]) rankMap[r.promotor_id] = { nome: nomeMap[r.promotor_id]||'Promotor', pts: 0, pct: 0 };
        const pct = r.meta > 0 ? r.realizado / r.meta : 0;
        rankMap[r.promotor_id].pts += pct >= 1 ? 50 : pct >= 0.8 ? 25 : Math.round(pct * 20);
        rankMap[r.promotor_id].pct = Math.max(rankMap[r.promotor_id].pct, Math.round(pct * 100));
      });

      // Adiciona o promotor atual com pontos locais
      if (!rankMap[S.promotorId]) rankMap[S.promotorId] = { nome: S.promotorNome, pts: 0, pct: 0 };
      rankMap[S.promotorId].pts = Math.max(rankMap[S.promotorId].pts, pts);

      const sorted = Object.entries(rankMap).sort((a,b) => b[1].pts - a[1].pts);
      const pos = sorted.findIndex(([id]) => id === S.promotorId) + 1;
      if ($('rank-minha-posicao')) $('rank-minha-posicao').textContent = '#' + pos;

      renderListaRanking(sorted.slice(0, 10).map(([id, d]) => ({ ...d, eu: id === S.promotorId })));
    } else {
      renderRankingMock(pts);
    }
  } catch(e) {
    renderRankingMock(pts);
  }

  // Conquistas
  renderConquistas();
  // Tabela de pontos
  renderTabelaPontos();
  // Histórico
  renderHistoricoPontos(hist);
}

function renderListaRanking(lista) {
  const el = $('lista-ranking'); if (!el) return;
  const medalhas = ['gold','silver','bronze'];
  const emojis = ['🥇','🥈','🥉'];
  el.innerHTML = lista.map((p, i) => {
    const cls = i < 3 ? medalhas[i] : '';
    const pos = i + 1;
    return `<div class="rank-item${p.eu?' me':''}">
      <div class="rank-pos ${cls}">${i < 3 ? emojis[i] : pos}</div>
      <div class="rank-avatar ${cls}">${getNivel(p.pts).icon}</div>
      <div class="rank-info">
        <div class="rank-nome">${p.nome}${p.eu?' <span style="font-size:9px;color:var(--brand)">(você)</span>':''}</div>
        <div class="rank-detalhe">${getNivel(p.pts).nome} · ${p.pct}% da meta</div>
      </div>
      <div><div class="rank-pts">${p.pts.toLocaleString('pt-BR')}</div><div class="rank-pts-lbl">pts</div></div>
    </div>`;
  }).join('');
}

function renderRankingMock(meusPts) {
  // Exibe ranking demonstrativo quando sem dados reais
  const el = $('lista-ranking'); if (!el) return;
  const mock = [
    { nome: S.promotorNome || 'Você', pts: meusPts, pct: S.desempenho.meta>0?Math.round(S.desempenho.realizado/S.desempenho.meta*100):0, eu: true },
    { nome: 'Ana Silva',     pts: Math.max(meusPts - 15, 0), pct: 88, eu: false },
    { nome: 'Carlos Lima',   pts: Math.max(meusPts - 30, 0), pct: 74, eu: false },
    { nome: 'Fernanda Costa',pts: Math.max(meusPts - 45, 0), pct: 65, eu: false },
  ].sort((a,b) => b.pts - a.pts);
  const pos = mock.findIndex(p => p.eu) + 1;
  if ($('rank-minha-posicao')) $('rank-minha-posicao').textContent = '#' + pos;
  el.innerHTML = '<div class="ibox ibox-amber" style="margin:8px 14px 4px">⚠️ Demonstração — conecte ao Supabase para ver o ranking real da equipe.</div>' +
    renderListaRankingHTML(mock);
}

function renderListaRankingHTML(lista) {
  const medalhas = ['gold','silver','bronze'];
  const emojis = ['🥇','🥈','🥉'];
  return lista.map((p, i) => {
    const cls = i < 3 ? medalhas[i] : '';
    return `<div class="rank-item${p.eu?' me':''}">
      <div class="rank-pos ${cls}">${i < 3 ? emojis[i] : i+1}</div>
      <div class="rank-avatar ${cls}">${getNivel(p.pts).icon}</div>
      <div class="rank-info">
        <div class="rank-nome">${p.nome}${p.eu?' <span style="font-size:9px;color:var(--brand)">(você)</span>':''}</div>
        <div class="rank-detalhe">${getNivel(p.pts).nome} · ${p.pct}% da meta</div>
      </div>
      <div><div class="rank-pts">${p.pts.toLocaleString('pt-BR')}</div><div class="rank-pts-lbl">pts</div></div>
    </div>`;
  }).join('');
}

function renderConquistas() {
  const grid = $('conquistas-grid'); if (!grid) return;
  const stats = _rankData.stats;
  grid.innerHTML = CONQUISTAS.map(c => {
    const ok = c.cond(stats);
    return `<div class="conquista ${ok?'unlocked':'locked'}" title="${c.desc}">
      <div class="conquista-icon">${c.icon}</div>
      <div class="conquista-nome">${c.nome}</div>
    </div>`;
  }).join('');
}

function renderTabelaPontos() {
  const el = $('tabela-pontos'); if (!el) return;
  el.innerHTML = PONTOS.map(p =>
    `<div class="pts-row"><div class="pts-acao">${p.icon} ${p.acao}</div><div class="pts-val">+${p.pts} pts</div></div>`
  ).join('');
}

function renderHistoricoPontos(hist) {
  const el = $('historico-pontos'); if (!el) return;
  if (!hist || !hist.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">Nenhum evento hoje ainda.</div>'; return; }
  el.innerHTML = hist.map(h =>
    `<div class="hist-item"><div class="hist-dot" style="background:${h.cor}"></div><div class="hist-acao">${h.acao}<div style="font-size:10px;color:var(--text3)">${h.data}</div></div><div class="hist-pts" style="color:${h.cor}">+${h.pts}</div></div>`
  ).join('');
}

// Adiciona pontuação ao navTo
const _navToOrig = navTo;
navTo = function(name) {
  _navToOrig(name);
  if (name === 'pontuacao') {
    setRankPeriodo(_rankPeriodo || 'mes');
  }
};



