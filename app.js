'use strict';
const app = document.getElementById('app');
const eurInt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

const NAMES = ['Guillem', 'Carla', 'Aleix', 'Oriol'];
const state = { me: null, tickets: [], draws: {}, filter: 'all', config: { inviteRequired: false } };
const SORTEO = '2026-12-22'; // Sorteo de Navidad (22 de diciembre)
const PRECIO = 20;           // € por décimo

// ---------- utilidades ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
const SB_URL = 'https://nntnckrlgdfnhikndgjw.supabase.co';
const SB_KEY = 'sb_publishable_0ftjIEW7jBT50v-QFwOp2A_atqoFS7c';
let TOKEN = '';
try { TOKEN = localStorage.getItem('lot_token') || ''; } catch { /* sin almacenamiento */ }
function setToken(t) { TOKEN = t || ''; try { t ? localStorage.setItem('lot_token', t) : localStorage.removeItem('lot_token'); } catch { /* */ } }

async function rpc(fn, args) {
  let r, d = null;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {})
    });
    d = await r.json();
  } catch { const e = new Error('No hay conexión con el servidor'); e.status = 0; throw e; }
  if (!r.ok) { const e = new Error('Error del servidor'); e.status = r.status; throw e; }
  if (d && d.error) { const e = new Error(d.error); e.status = d.status || 400; throw e; }
  return d;
}
// Misma interfaz que antes (método + ruta) pero contra las funciones de Supabase
async function api(method, url, body) {
  let m;
  if (url === '/api/config') return rpc('lot_config');
  if (url === '/api/me') return rpc('lot_me', { p_token: TOKEN });
  if (url === '/api/data') return rpc('lot_data', { p_token: TOKEN });
  if (url === '/api/login' || url === '/api/register') {
    const d = url === '/api/login'
      ? await rpc('lot_login', { p_username: body.username, p_password: body.password })
      : await rpc('lot_register', { p_username: body.username, p_password: body.password, p_invite: body.invite || '', p_persona: body.persona || '' });
    setToken(d.token); return { user: d.user };
  }
  if (url === '/api/persona') return rpc('lot_set_persona', { p_token: TOKEN, p_persona: body.persona });
  if (url === '/api/logout') { const t = TOKEN; setToken(''); try { await rpc('lot_logout', { p_token: t }); } catch { /* */ } return { ok: true }; }
  if (url === '/api/tickets' && method === 'POST') return rpc('lot_save_ticket', { p_token: TOKEN, p_id: null, p_ticket: body });
  if ((m = url.match(/^\/api\/tickets\/([\w-]+)$/))) {
    if (method === 'PUT') return rpc('lot_save_ticket', { p_token: TOKEN, p_id: m[1], p_ticket: body });
    if (method === 'DELETE') return rpc('lot_delete_ticket', { p_token: TOKEN, p_id: m[1] });
  }
  if ((m = url.match(/^\/api\/draws\/(\d{4}-\d{2}-\d{2})$/)) && method === 'PUT')
    return rpc('lot_save_draw', { p_token: TOKEN, p_date: m[1], p_results: body.results });
  throw new Error('Ruta desconocida');
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- premios ----------
// Premios derivados de los números principales (reglas oficiales del sorteo de Navidad):
// aproximaciones (anterior/posterior), centenas, terminaciones (2 últimas cifras) y reintegro (última cifra del Gordo).
// El número del que se derivan centenas, terminaciones y reintegro queda exceptuado de ese premio.
const pad5 = n => String(n).padStart(5, '0');
function derivedGroups(results) {
  const nums = label => ((results.find(r => r.label === label) || { numeros: [] }).numeros).filter(n => n.length === 5);
  const out = [];
  const add = (label, euros, fn) => out.push({ label, euros, fn });
  for (const [lab, short, apr] of [['El Gordo', 'Gordo', 2000], ['2º premio', '2º', 1250], ['3er premio', '3º', 960]]) {
    for (const g of nums(lab)) {
      const prev = pad5((Number(g) + 99999) % 100000), next = pad5((Number(g) + 1) % 100000);
      add('Aprox. ' + short, apr, n => n === prev || n === next);
      add('Centena ' + short, 100, n => n !== g && n.slice(0, 3) === g.slice(0, 3));
      add('Terminación ' + short, 100, n => n !== g && n.slice(3) === g.slice(3));
    }
  }
  for (const g of nums('4º premio')) add('Centena 4º', 100, n => n !== g && n.slice(0, 3) === g.slice(0, 3));
  for (const g of nums('El Gordo')) add('Reintegro', 20, n => n !== g && n[4] === g[4]);
  return out;
}
function prizesFor(t) {
  const draw = state.draws[t.sorteo];
  if (!draw) return null;
  const hits = [];
  for (const r of draw.results) {
    if (r.label === 'Reintegro') continue;
    if (r.numeros.some(n => t.numero.endsWith(n))) hits.push({ label: r.label, euros: r.euros });
  }
  for (const d of derivedGroups(draw.results)) if (d.fn(t.numero)) hits.push({ label: d.label, euros: d.euros });
  const total = hits.reduce((s, r) => s + r.euros, 0) * t.decimos;
  return { hits, total };
}

// ---------- carga ----------
async function loadData() {
  const d = await api('GET', '/api/data');
  state.tickets = d.tickets; state.draws = d.draws;
}
async function boot() {
  try { state.config = await api('GET', '/api/config'); } catch { /* */ }
  try {
    state.me = (await api('GET', '/api/me')).user;
    await loadData();
    renderMain();
    if (!state.me.persona) personaDialog();
  } catch { renderLogin(); }
}

// ---------- login ----------
function renderLogin(mode = 'login') {
  const err = h('div', { class: 'err', role: 'alert' });
  const user = h('input', { id: 'u', autocomplete: 'username', autocapitalize: 'none', required: true, maxlength: 20 });
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: 6 });
  let persona = '';
  const personaBox = h('div', { class: 'chips', style: 'margin-top:2px' }, (state.config.personas || NAMES.map(name => ({ name, taken: false }))).map(p => {
    const b = h('button', { type: 'button', class: 'chip pchip', disabled: p.taken, onclick: () => { persona = p.name; for (const c of personaBox.children) c.classList.toggle('on', c.dataset.n === persona); } }, p.name + (p.taken ? ' (ya vinculado)' : ''));
    b.dataset.n = p.name; return b;
  }));
  const invite = h('input', { id: 'i', autocomplete: 'off', placeholder: 'Pídeselo a quien creó la app' });
  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      try {
        const body = { username: user.value, password: pass.value };
        if (mode === 'register') { if (!persona) { err.textContent = 'Elige quién eres'; return; } body.invite = invite.value; body.persona = persona; }
        state.me = (await api('POST', mode === 'login' ? '/api/login' : '/api/register', body)).user;
        await loadData(); renderMain();
        if (!state.me.persona) personaDialog();
      } catch (x) { err.textContent = x.message; }
    }
  },
    h('label', { for: 'u' }, 'Usuario'), user,
    h('label', { for: 'p' }, 'Contraseña'), pass,
    mode === 'register' ? [h('label', {}, '¿Quién eres?'), personaBox] : null,
    mode === 'register' && state.config.inviteRequired ? [h('label', { for: 'i' }, 'Código de invitación'), invite] : null,
    err,
    h('button', { class: 'btn gold', style: 'width:100%;margin-top:10px', type: 'submit' }, mode === 'login' ? 'Entrar' : 'Crear cuenta')
  );
  app.replaceChildren(
    h('div', { class: 'login-wrap' }, h('div', { class: 'login' },
      h('div', { class: 'decimo t-Jueves' }, h('div', { style: 'width:100%' },
        h('div', { class: 'dhead', style: 'justify-content:center' }, h('span', { class: 'logo' }, 'Lotería de Mafriges')),
        h('h1', {}, 'Decims i Numeros'),
        h('p', { class: 'sub' }, 'Apunta · Comparte · Comprueba'),
        h('div', { class: 'tabs' },
          h('button', { type: 'button', class: mode === 'login' ? 'on' : '', onclick: () => renderLogin('login') }, 'Entrar'),
          h('button', { type: 'button', class: mode === 'register' ? 'on' : '', onclick: async () => { try { state.config = await api('GET', '/api/config'); } catch { /* */ } renderLogin('register'); } }, 'Registrarse')),
        form)))));
  user.focus();
}

// ---------- principal ----------
function renderMain() {
  const list = state.tickets.slice().sort((a, b) => b.created - a.created);

  let invested = 0, won = 0;
  for (const t of list) {
    invested += t.precio * t.decimos;
    const p = prizesFor(t); if (p) won += p.total;
  }

  app.replaceChildren(
    h('div', { class: 'topbar' },
      h('div', { class: 'brand' }, 'Decims i Numeros', h('small', {}, 'Lotería de Mafriges')),
      h('div', { class: 'who' }, h('span', {}, '👤 ' + (state.me.persona || state.me.username)),
        h('button', { class: 'link', onclick: async () => { await api('POST', '/api/logout', {}); state.me = null; renderLogin(); } }, 'Salir'))),
    h('div', { class: 'wrap' },
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn gold', onclick: () => ticketDialog() }, '+ Apuntar número'),
        h('button', { class: 'btn ghost', onclick: () => resultsDialog() }, '🏆 Resultados')),
      personsBlock(list),
      cuentasBlock(list),
      h('div', { class: 'summary' },
        h('div', {}, h('b', {}, list.reduce((s, t) => s + t.decimos, 0)), h('span', {}, 'Décimos')),
        h('div', {}, h('b', {}, eur.format(invested)), h('span', {}, 'Jugado')),
        h('div', { class: 'win' }, h('b', {}, eur.format(won)), h('span', {}, 'Premios'))),
      list.length ? h('div', { class: 'grid' }, list.map(decimo))
        : h('div', { class: 'empty' }, 'Todavía no hay números apuntados.', h('br'), 'Pulsa «Apuntar número» para empezar.'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:24px' },
        'Los premios se calculan con los resultados que se introducen a mano. Compruébalos siempre con el resultado oficial de Loterías y Apuestas del Estado.')));
}

const fmtN = n => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
function personsBlock(list) {
  const per = NAMES.map(n => ({ n, cost: 0, dec: 0, prize: 0 }));
  const hasDraw = !!state.draws[SORTEO];
  let sinAsignar = 0;
  for (const t of list) {
    const ppl = t.participantes ? t.participantes.split(',').map(x => x.trim()).filter(x => NAMES.includes(x)) : [];
    if (!ppl.length) { sinAsignar++; continue; }
    const p = prizesFor(t);
    for (const n of ppl) {
      const r = per.find(x => x.n === n);
      r.cost += t.precio * t.decimos / ppl.length;
      r.dec += t.decimos / ppl.length;
      if (p) r.prize += p.total / ppl.length;
    }
  }
  return h('div', {},
    h('div', { class: 'persons' }, per.map(r => h('div', { class: 'person' + (state.me.persona === r.n ? ' me' : '') },
      h('b', {}, r.n),
      h('span', {}, 'Pone ' + eur.format(r.cost)),
      h('span', {}, fmtN(r.dec) + (r.dec === 1 ? ' décimo' : ' décimos')),
      hasDraw ? h('span', { class: 'pz' }, 'Le toca ' + eur.format(r.prize)) : null))),
    sinAsignar ? h('p', { class: 'hint', style: 'margin:-8px 0 14px' }, sinAsignar + (sinAsignar === 1 ? ' número sin participantes asignados' : ' números sin participantes asignados') + ' (no se cuentan arriba).') : null);
}

function cuentasBlock(list) {
  const net = Object.fromEntries(NAMES.map(n => [n, 0]));
  let sinPagador = 0, hay = false;
  for (const t of list) {
    const ppl = t.participantes ? t.participantes.split(',').map(x => x.trim()).filter(x => NAMES.includes(x)) : [];
    if (!ppl.length) continue;
    if (!t.pagadoPor) { sinPagador++; continue; }
    const cost = t.precio * t.decimos;
    hay = true;
    net[t.pagadoPor] += cost;
    for (const n of ppl) net[n] -= cost / ppl.length;
  }
  const deb = NAMES.filter(n => net[n] < -0.005).map(n => ({ n, v: -net[n] })).sort((a, b) => b.v - a.v);
  const acr = NAMES.filter(n => net[n] > 0.005).map(n => ({ n, v: net[n] })).sort((a, b) => b.v - a.v);
  const pays = [];
  let i = 0, j = 0;
  while (i < deb.length && j < acr.length) {
    const x = Math.min(deb[i].v, acr[j].v);
    if (x > 0.005) pays.push({ de: deb[i].n, a: acr[j].n, v: x });
    deb[i].v -= x; acr[j].v -= x;
    if (deb[i].v < 0.005) i++;
    if (acr[j].v < 0.005) j++;
  }
  const me = state.me.persona;
  let body;
  if (!hay) body = h('p', { class: 'hint', style: 'margin:0' }, 'Indica quién ha pagado cada décimo (al editarlo) para ver aquí quién debe dinero.');
  else if (!pays.length) body = h('p', { style: 'margin:0' }, '✅ Todo en orden: nadie debe dinero a nadie.');
  else body = h('div', {}, pays.map(p => h('div', { class: 'debt' + (p.de === me || p.a === me ? ' me' : '') },
    h('b', {}, p.de), ' debe ', h('b', { class: 'amt' }, eur.format(Math.round(p.v * 100) / 100)), ' a ', h('b', {}, p.a))));
  return h('div', { class: 'cuentas' },
    h('div', { class: 'cuentas-h' }, '💶 Cuentas'),
    body,
    sinPagador ? h('p', { class: 'hint', style: 'margin:6px 0 0' }, sinPagador + (sinPagador === 1 ? ' décimo sin pagador indicado' : ' décimos sin pagador indicado') + ' (no se cuentan).') : null);
}

function decimo(t) {
  const p = prizesFor(t);
  const won = p && p.hits.length > 0 && p.total > 0;
  const people = t.participantes ? t.participantes.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
  let status;
  if (!p) status = h('span', { class: 'status' }, '⏳ Pendiente de sorteo');
  else if (won) status = h('div', { class: 'prizes' }, p.hits.map(r => r.label || 'Premio').join(' + '), ' → ', h('b', {}, eur.format(p.total)),
    people.length > 1 ? h('div', {}, '≈ ' + eur.format(p.total / people.length) + ' por persona') : null);
  else status = h('span', { class: 'status' }, 'Sin premio');

  return h('article', { class: `decimo t-Navidad${won ? ' won' : ''}` },
    won ? h('div', { class: 'ribbon' }, '¡PREMIADO!') : null,
    h('div', { class: 'stub' }, h('span', {}, 'Décimo'), h('b', {}, '×' + t.decimos)),
    h('div', { class: 'dbody' },
      h('div', { class: 'dhead' }, h('span', { class: 'logo' }, 'Lotería Nacional'), h('span', { class: 'tipo' }, 'Sorteo de Navidad')),
      h('div', { class: 'num', 'aria-label': 'Número ' + t.numero }, [...t.numero].map(d => h('span', { class: 'digit' }, d))),
      h('div', { class: 'meta' },
        h('span', {}, h('b', {}, 'Fecha '), fmtDate(t.sorteo)),
        h('span', {}, h('b', {}, 'Precio '), eur.format(t.precio)),
        h('span', {}, h('b', {}, 'Pagó '), t.pagadoPor || 'sin indicar')),
      people.length ? h('div', { class: 'friends' }, 'Con: ' + people.join(', ')) : null,
      t.notas ? h('div', { class: 'notes' }, t.notas) : null,
      h('div', { style: 'text-align:center;margin-top:8px' }, status),
      h('div', { class: 'dfoot' },
        h('span', {}, 'Apuntado por ' + t.createdBy + (t.updatedBy !== t.createdBy ? ' · editado por ' + t.updatedBy : '')),
        h('div', { class: 'actions' },
          h('button', { class: 'btn small ghost', onclick: () => ticketDialog(t) }, 'Editar'),
          h('button', { class: 'btn small danger', onclick: () => confirmDelete(t) }, 'Borrar')))));
}

// ---------- diálogos ----------
function openDialog(title, body, foot) {
  const dlg = h('dialog', {}, h('div', { class: 'dlg-head' }, title), h('div', { class: 'dlg-body' }, body), h('div', { class: 'dlg-foot' }, foot(() => dlg.close())));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function ticketDialog(t) {
  const editing = !!t;
  const chosen = new Set(t ? t.participantes.split(',').map(x => x.trim()).filter(x => NAMES.includes(x)) : (state.me.persona ? [state.me.persona] : []));
  const pbox = h('div', { class: 'chips', style: 'margin-top:2px' }, NAMES.map(n => {
    const b = h('button', { type: 'button', class: 'chip pchip' + (chosen.has(n) ? ' on' : ''), 'aria-pressed': chosen.has(n) ? 'true' : 'false',
      onclick: () => { chosen.has(n) ? chosen.delete(n) : chosen.add(n); b.classList.toggle('on', chosen.has(n)); b.setAttribute('aria-pressed', chosen.has(n)); } }, n);
    return b;
  }));
  let payer = t ? (t.pagadoPor || '') : (state.me.persona || '');
  const paybox = h('div', { class: 'chips', style: 'margin-top:2px' }, [...NAMES, ''].map(n => {
    const b = h('button', { type: 'button', class: 'chip pchip' + (payer === n ? ' on' : ''), onclick: () => { payer = n; for (const c of paybox.children) c.classList.toggle('on', c.dataset.n === payer); } }, n || 'Nadie aún');
    b.dataset.n = n; return b;
  }));
  const f = {
    numero: h('input', { class: 'bignum', inputmode: 'numeric', maxlength: 5, pattern: '\\d{5}', placeholder: '00000', required: true, autocomplete: 'off', value: t ? t.numero : '' }),
    decimos: h('input', { type: 'number', min: 1, max: 100, step: 1, required: true, value: t ? t.decimos : 1 }),
    precio: h('input', { type: 'number', min: 0, step: '0.01', required: true, value: t ? t.precio : PRECIO }),
    pagadoPor: { get value() { return payer; } },
    participantes: { get value() { return NAMES.filter(n => chosen.has(n)).join(', '); } },
    notas: h('textarea', { maxlength: 300, rows: 2, value: t ? t.notas : '' })
  };
  f.notas.value = t ? t.notas : '';
  f.numero.addEventListener('input', () => { f.numero.value = f.numero.value.replace(/\D/g, '').slice(0, 5); });
  const err = h('div', { class: 'err', role: 'alert' });

  const form = h('form', { id: 'tform' },
    h('label', {}, 'Número (5 cifras)'), f.numero,
    h('div', { class: 'row' },
      h('div', {}, h('label', {}, 'Nº décimos'), f.decimos),
      h('div', {}, h('label', {}, 'Precio por décimo (€)'), f.precio)),
    h('label', {}, 'Participantes'), pbox,
    h('label', {}, '¿Quién ha pagado?'), paybox,
    h('label', {}, 'Notas'), f.notas, err);

  const dlg = openDialog(editing ? 'Editar número' : 'Apuntar número', form, close => [
    h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn gold', type: 'submit', form: 'tform' }, 'Guardar')]);

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    body.tipo = 'Navidad'; body.sorteo = SORTEO;
    try {
      if (editing) await api('PUT', '/api/tickets/' + t.id, body); else await api('POST', '/api/tickets', body);
      await loadData(); dlg.close(); renderMain(); toast(editing ? 'Cambios guardados' : '¡Número apuntado!');
    } catch (x) { err.textContent = x.message; }
  });
  f.numero.focus();
}

async function personaDialog() {
  try { state.config = await api('GET', '/api/config'); } catch { /* */ }
  let sel = '';
  const err = h('div', { class: 'err', role: 'alert' });
  const box = h('div', { class: 'chips' }, (state.config.personas || NAMES.map(name => ({ name, taken: false }))).map(p => {
    const b = h('button', { type: 'button', class: 'chip pchip', disabled: p.taken, onclick: () => { sel = p.name; for (const c of box.children) c.classList.toggle('on', c.dataset.n === sel); } }, p.name + (p.taken ? ' (ya vinculado)' : ''));
    b.dataset.n = p.name; return b;
  }));
  const dlg = openDialog('¿Quién eres?', [h('p', {}, 'Vincula tu usuario a tu nombre. Solo se puede hacer una vez.'), box, err], close => [
    h('button', { class: 'btn gold', type: 'button', onclick: async () => {
      err.textContent = '';
      if (!sel) { err.textContent = 'Elige tu nombre'; return; }
      try { await api('POST', '/api/persona', { persona: sel }); state.me.persona = sel; close(); renderMain(); toast('Vinculado a ' + sel); }
      catch (x) { err.textContent = x.message; }
    } }, 'Guardar')]);
  dlg.addEventListener('cancel', e => e.preventDefault());
}

function confirmDelete(t) {
  openDialog('¿Borrar este número?', h('p', {}, `Se borrará el ${t.numero} para todos los usuarios.`), close => [
    h('button', { class: 'btn ghost', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn danger', onclick: async () => {
      try { await api('DELETE', '/api/tickets/' + t.id); await loadData(); close(); renderMain(); toast('Borrado'); }
      catch (x) { toast(x.message); }
    } }, 'Borrar')]);
}

// Premios de la Lotería de Navidad 2026, por décimo (importes oficiales)
const FIJOS = [
  { label: 'El Gordo', euros: 400000, slots: 1 },
  { label: '2º premio', euros: 125000, slots: 1 },
  { label: '3er premio', euros: 50000, slots: 1 },
  { label: '4º premio', euros: 20000, slots: 2 },
  { label: '5º premio', euros: 6000, slots: 8 }
];
const PEDREA = { label: 'Pedrea', euros: 100 };
const EXTRAS = [['Otro premio', 0]];

function resultsDialog(date = SORTEO) {
  const saved = state.draws[date] ? state.draws[date].results : [];
  const known = [...FIJOS.map(f => f.label), PEDREA.label, 'Reintegro'];
  const vals = FIJOS.map(f => { const g = saved.find(r => r.label === f.label); return Array.from({ length: f.slots }, (_, i) => (g && g.numeros[i]) || ''); });
  const ped = saved.find(r => r.label === PEDREA.label);
  const extras = [];
  for (const r of saved) if (!known.includes(r.label)) for (const n of r.numeros) extras.push({ numero: n, label: r.label, euros: r.euros });
  const err = h('div', { class: 'err', role: 'alert' });
  const extraBox = h('div', {});

  const fixedRows = FIJOS.map((f, fi) => h('div', { class: 'fx' },
    h('div', { class: 'fx-h' }, h('b', {}, f.label), h('span', {}, eurInt.format(f.euros) + ' / décimo')),
    h('div', { class: 'fx-in' }, vals[fi].map((v, si) => h('input', {
      class: 'fx-n', inputmode: 'numeric', maxlength: f.digits || 5, placeholder: f.digits === 1 ? '0' : '00000', value: v, 'aria-label': f.label + (f.slots > 1 ? ' ' + (si + 1) : ''),
      oninput: e => { vals[fi][si] = e.target.value.replace(/\D/g, '').slice(0, f.digits || 5); e.target.value = vals[fi][si]; } })))));

  const pedCount = h('span', { class: 'hint' });
  const pedTa = h('textarea', { rows: 3, placeholder: 'Pega aquí los números de la pedrea (separados por espacios, comas o líneas)', 'aria-label': 'Números de la pedrea',
    oninput: () => { const n = new Set((pedTa.value.match(/\d+/g) || []).filter(x => x.length === 5)).size; pedCount.textContent = n + ' números'; } });
  pedTa.value = ped ? ped.numeros.join(' ') : '';
  pedCount.textContent = ped ? ped.numeros.length + ' números' : '0 números';

  function drawExtras() {
    extraBox.replaceChildren(...[
      extras.length ? h('div', { class: 'res-head' }, h('span', {}, 'Número'), h('span', {}, 'Premio'), h('span', {}, '€ / décimo'), h('span')) : null,
      extras.map((r, i) => h('div', { class: 'res-row' },
        h('input', { inputmode: 'numeric', maxlength: 5, value: r.numero, 'aria-label': 'Número premiado', oninput: e => { r.numero = e.target.value.replace(/\D/g, '').slice(0, 5); e.target.value = r.numero; } }),
        h('input', { maxlength: 40, value: r.label, 'aria-label': 'Nombre del premio', oninput: e => { r.label = e.target.value; } }),
        h('input', { type: 'number', min: 0, step: '0.01', value: r.euros, 'aria-label': 'Euros por décimo', oninput: e => { r.euros = e.target.value; } }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Quitar', onclick: () => { extras.splice(i, 1); drawExtras(); } }, '✕'))),
      h('div', { class: 'chips' }, EXTRAS.map(([l, e]) =>
        h('button', { class: 'chip', type: 'button', onclick: () => { extras.push({ numero: '', label: l === 'Otro premio' ? '' : l, euros: e || '' }); drawExtras(); } }, '+ ' + l)))].flat().filter(Boolean));
  }
  drawExtras();

  openDialog('Resultados del Sorteo de Navidad', [
    h('p', { class: 'hint' }, 'Escribe solo los números premiados: los importes ya están puestos. El reintegro, las aproximaciones, las centenas y las terminaciones se calculan solos a partir de estos números.'),
    ...fixedRows,
    h('div', { class: 'fx' }, h('div', { class: 'fx-h' }, h('b', {}, 'Pedrea'), h('span', {}, eurInt.format(PEDREA.euros) + ' / décimo')), pedTa, pedCount),
    h('div', { class: 'fx' }, h('div', { class: 'fx-h' }, h('b', {}, 'Otros premios'), h('span', {}, 'solo si hace falta')), extraBox),
    err,
    h('p', { class: 'hint' }, 'Los resultados se comparten con todos los usuarios.')],
    close => [
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn gold', type: 'button', onclick: async () => {
        err.textContent = '';
        const results = [];
        for (let fi = 0; fi < FIJOS.length; fi++) {
          const f = FIJOS[fi]; const need = f.digits || 5;
          const nums = vals[fi].filter(Boolean);
          if (nums.some(n => n.length !== need)) { err.textContent = f.label + ': el número debe tener ' + (need === 1 ? '1 cifra' : '5 cifras'); return; }
          if (nums.length) results.push({ label: f.label, euros: f.euros, numeros: [...new Set(nums)] });
        }
        const toks = pedTa.value.match(/\d+/g) || [];
        const bad = toks.filter(x => x.length !== 5).length;
        if (bad) { err.textContent = 'Pedrea: ' + bad + (bad === 1 ? ' valor no tiene' : ' valores no tienen') + ' 5 cifras'; return; }
        if (toks.length) results.push({ label: PEDREA.label, euros: PEDREA.euros, numeros: [...new Set(toks)] });
        for (const r of extras) {
          if (r.numero === '') continue;
          results.push({ label: (r.label || 'Premio').trim(), euros: Number(r.euros) || 0, numeros: [r.numero] });
        }
        try {
          state.draws = (await api('PUT', '/api/draws/' + date, { results })).draws;
          close(); renderMain(); toast('Resultados guardados');
        } catch (x) { err.textContent = x.message; }
      } }, 'Guardar y comprobar')]);
}

// refresco periódico para ver lo que apuntan los demás
setInterval(async () => {
  if (!state.me || document.hidden || document.querySelector('dialog[open]')) return;
  try { await loadData(); renderMain(); } catch (x) { if (x.status === 401) { state.me = null; renderLogin(); } }
}, 20000);

boot();
