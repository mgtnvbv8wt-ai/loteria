'use strict';
const app = document.getElementById('app');
const eurInt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

const state = { me: null, groups: [], tickets: [], settlements: [], draws: {}, view: 'all', fold: false };
try { state.fold = localStorage.getItem('lot_fold') === '1'; } catch { /* */ }
const grp = id => state.groups.find(g => g.id === id);
const namesOf = g => g.personas.map(p => p.name);
const partsOf = (t, g) => (t.participantes ? t.participantes.split(',').map(x => x.trim()).filter(x => namesOf(g).includes(x)) : []);
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
  if (url === '/api/group-by-code') return rpc('lot_group_by_code', { p_code: body.code });
  if (url === '/api/groups') return rpc('lot_create_group', { p_token: TOKEN, p_name: body.name, p_my_persona: body.persona, p_personas: body.others || '' });
  if (url === '/api/groups/join') return rpc('lot_join_group', { p_token: TOKEN, p_code: body.code, p_persona: body.persona });
  if (url === '/api/groups/persona') return rpc('lot_add_persona', { p_token: TOKEN, p_group: body.group, p_name: body.name });
  if (url === '/api/history') return rpc('lot_history', { p_token: TOKEN });
  if (url === '/api/password') return rpc('lot_change_password', { p_token: TOKEN, p_old: body.old, p_new: body.new });
  if (url === '/api/groups/leave') return rpc('lot_leave_group', { p_token: TOKEN, p_group: body.group });
  if (url === '/api/groups/rename') return rpc('lot_rename_group', { p_token: TOKEN, p_group: body.group, p_name: body.name });
  if (url === '/api/groups/regen') return rpc('lot_regen_code', { p_token: TOKEN, p_group: body.group });
  if (url === '/api/groups/me') return rpc('lot_rename_persona', { p_token: TOKEN, p_group: body.group, p_new: body.name });
  if (url === '/api/settlements' && method === 'POST') return rpc('lot_add_settlement', { p_token: TOKEN, p_group: body.group, p_from: body.from, p_to: body.to, p_amount: body.amount });
  if (url === '/api/draws/oficial') return rpc('lot_save_draw_auto', { p_token: TOKEN, p_date: SORTEO, p_results: body.results });
  if (url === '/api/draws/restore') return rpc('lot_restore_draw', { p_token: TOKEN, p_log_id: body.id });
  if ((m = url.match(/^\/api\/settlements\/([\w-]+)$/)) && method === 'DELETE') return rpc('lot_delete_settlement', { p_token: TOKEN, p_id: m[1] });
  if ((m = url.match(/^\/api\/tickets\/([\w-]+)\/restore$/)) && method === 'POST') return rpc('lot_restore_ticket', { p_token: TOKEN, p_id: m[1] });
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
const fmtWhen = ms => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  state.groups = d.groups; state.tickets = d.tickets; state.draws = d.draws; state.settlements = d.settlements || [];
}
async function boot() {
  try {
    state.me = (await api('GET', '/api/me')).user;
    await loadData();
    renderMain();
    autoOficial();
  } catch { renderLogin(); }
}

// Selector de nombre: botones con los nombres libres + campo para escribir uno nuevo
function nameChooser(personas) {
  let value = '';
  const box = h('div', { class: 'chips', style: 'margin-top:2px' });
  const free = h('input', { placeholder: 'o escribe tu nombre', maxlength: 20, autocomplete: 'off', style: 'margin-top:8px',
    oninput: () => { value = free.value.trim(); for (const c of box.children) c.classList.remove('on'); } });
  for (const p of personas) {
    const b = h('button', { type: 'button', class: 'chip pchip', disabled: p.taken,
      onclick: () => { value = p.name; free.value = ''; for (const c of box.children) c.classList.toggle('on', c.dataset.n === value); } }, p.name + (p.taken ? ' (ya vinculado)' : ''));
    b.dataset.n = p.name; box.append(b);
  }
  return { el: h('div', {}, box, free), get value() { return value; } };
}

// ---------- login ----------
function renderLogin(mode = 'login') {
  const err = h('div', { class: 'err', role: 'alert' });
  const user = h('input', { id: 'u', autocomplete: 'username', autocapitalize: 'none', required: true, maxlength: 20 });
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: 6 });
  let chooser = null;
  const code = h('input', { id: 'i', autocomplete: 'off', autocapitalize: 'none', placeholder: 'Código que te han pasado' });
  const codeBox = h('div', {});
  async function check() {
    err.textContent = ''; chooser = null; codeBox.replaceChildren();
    try {
      const g = await api('POST', '/api/group-by-code', { code: code.value });
      chooser = nameChooser(g.personas);
      codeBox.replaceChildren(h('p', { class: 'hint' }, 'Sesión: ', h('b', {}, g.name)), h('label', {}, '¿Quién eres?'), chooser.el);
    } catch (x) { err.textContent = x.message; }
  }
  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      try {
        const body = { username: user.value, password: pass.value };
        if (mode === 'register') {
          if (!chooser) { err.textContent = 'Escribe el código y pulsa «Comprobar código»'; return; }
          if (!chooser.value) { err.textContent = 'Elige o escribe tu nombre'; return; }
          body.invite = code.value; body.persona = chooser.value;
        }
        state.me = (await api('POST', mode === 'login' ? '/api/login' : '/api/register', body)).user;
        state.view = 'all';
        await loadData(); renderMain();
      } catch (x) { err.textContent = x.message; }
    }
  },
    h('label', { for: 'u' }, 'Usuario'), user,
    h('label', { for: 'p' }, 'Contraseña'), pass,
    mode === 'register' ? [h('label', { for: 'i' }, 'Código de la sesión'), code,
      h('button', { class: 'btn small ghost', type: 'button', style: 'margin-top:8px', onclick: check }, 'Comprobar código'), codeBox] : null,
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
          h('button', { type: 'button', class: mode === 'register' ? 'on' : '', onclick: () => renderLogin('register') }, 'Registrarse')),
        form)))));
  user.focus();
}

// ---------- principal ----------
function renderMain() {
  const gs = state.groups;
  if (state.view !== 'all' && !grp(state.view)) state.view = 'all';
  const list = state.tickets.filter(t => state.view === 'all' || t.groupId === state.view).sort((a, b) => b.created - a.created);

  let invested = 0, won = 0;
  for (const t of list) {
    invested += t.precio * t.decimos;
    const p = prizesFor(t); if (p) won += p.total;
  }
  const sections = (state.view === 'all' ? gs : [grp(state.view)]).filter(g => list.some(t => t.groupId === g.id));
  const blocks = sections.map(g => {
    const gl = list.filter(t => t.groupId === g.id);
    return h('div', {}, sections.length > 1 ? h('div', { class: 'gname' }, '🗂 ' + g.name) : null, personsBlock(gl, g), cuentasBlock(gl, g));
  });
  const tabs = gs.length > 1 ? h('div', { class: 'chips gtabs' }, [['all', 'Todas'], ...gs.map(g => [g.id, g.name])].map(([id, label]) =>
    h('button', { type: 'button', class: 'chip pchip' + (state.view === id ? ' on' : ''), onclick: () => { state.view = id; renderMain(); } }, label))) : null;

  app.replaceChildren(
    h('div', { class: 'topbar' },
      h('div', { class: 'brand' }, 'Decims i Numeros', h('small', {}, 'Lotería de Mafriges')),
      h('div', { class: 'who' }, h('button', { class: 'link', onclick: accountDialog }, '👤 ' + state.me.username),
        h('button', { class: 'burger', type: 'button', 'aria-label': 'Menú', 'aria-haspopup': 'true', onclick: e => { e.stopPropagation(); document.querySelector('.menu').classList.toggle('open'); } }, '☰'),
        h('div', { class: 'menu', role: 'menu' }, [
          ['🏆 Resultados', () => resultsDialog()], ['🗂 Sesiones', () => sesionesDialog()], ['🕘 Historial', () => historyDialog()],
          ['📤 Compartir', () => shareDialog()], ['👤 Mi cuenta', accountDialog], ['Salir', logout]
        ].map(([label, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { document.querySelector('.menu').classList.remove('open'); fn(); } }, label))))),
    h('div', { class: 'wrap' },
      countdown(),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn gold', onclick: () => ticketDialog() }, '+ Apuntar número')),
      tabs,
      blocks.length ? h('details', { class: 'fold', open: state.fold, ontoggle: e => { state.fold = e.currentTarget.open; try { localStorage.setItem('lot_fold', state.fold ? '1' : '0'); } catch { /* */ } } },
        h('summary', {}, '💶 Cuentas y personas'), ...blocks) : null,
      list.length ? h('div', { class: 'summary' },
        h('div', {}, h('b', {}, list.reduce((s, t) => s + t.decimos, 0)), h('span', {}, 'Décimos')),
        h('div', {}, h('b', {}, eur.format(invested)), h('span', {}, 'Jugado')),
        h('div', { class: 'win' }, h('b', {}, eur.format(won)), h('span', {}, 'Premios'))) : null,
      list.length ? h('div', { class: 'grid' }, list.map(decimo))
        : h('div', { class: 'empty' }, gs.length ? 'Todavía no hay números apuntados.' : 'Todavía no estás en ninguna sesión.',
            h('br'), gs.length ? 'Pulsa «Apuntar número» para empezar.' : 'Pulsa «Sesiones» para crear una o unirte con un código.'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:24px' },
        'Los premios se calculan con los resultados que se introducen a mano. Compruébalos siempre con el resultado oficial de Loterías y Apuestas del Estado.')));
}

const fmtN = n => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
function personsBlock(list, g) {
  const per = namesOf(g).map(n => ({ n, cost: 0, dec: 0, prize: 0 }));
  const hasDraw = !!state.draws[SORTEO];
  let sinAsignar = 0;
  for (const t of list) {
    const ppl = partsOf(t, g);
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
    h('div', { class: 'persons' }, per.map(r => h('div', { class: 'person' + (g.persona === r.n ? ' me' : '') },
      h('b', {}, r.n),
      h('span', {}, 'Pone ' + eur.format(r.cost)),
      h('span', {}, fmtN(r.dec) + (r.dec === 1 ? ' décimo' : ' décimos')),
      hasDraw ? h('span', { class: 'pz' }, 'Le toca ' + eur.format(r.prize)) : null))),
    sinAsignar ? h('p', { class: 'hint', style: 'margin:-8px 0 14px' }, sinAsignar + (sinAsignar === 1 ? ' número sin participantes asignados' : ' números sin participantes asignados') + ' (no se cuentan arriba).') : null);
}

function calcCuentas(list, g) {
  const net = Object.fromEntries(namesOf(g).map(n => [n, 0]));
  let sinPagador = 0, hay = false;
  for (const t of list) {
    const ppl = partsOf(t, g);
    if (!ppl.length) continue;
    if (!t.pagadoPor) { sinPagador++; continue; }
    const cost = t.precio * t.decimos;
    hay = true;
    net[t.pagadoPor] += cost;
    for (const n of ppl) net[n] -= cost / ppl.length;
  }
  const sets = state.settlements.filter(x => x.groupId === g.id);
  for (const x of sets) { if (x.from in net) net[x.from] += Number(x.amount); if (x.to in net) net[x.to] -= Number(x.amount); }
  const deb = namesOf(g).filter(n => net[n] < -0.005).map(n => ({ n, v: -net[n] })).sort((a, b) => b.v - a.v);
  const acr = namesOf(g).filter(n => net[n] > 0.005).map(n => ({ n, v: net[n] })).sort((a, b) => b.v - a.v);
  const pays = [];
  let i = 0, j = 0;
  while (i < deb.length && j < acr.length) {
    const x = Math.min(deb[i].v, acr[j].v);
    if (x > 0.005) pays.push({ de: deb[i].n, a: acr[j].n, v: Math.round(x * 100) / 100 });
    deb[i].v -= x; acr[j].v -= x;
    if (deb[i].v < 0.005) i++;
    if (acr[j].v < 0.005) j++;
  }
  return { pays, hay, sinPagador, sets };
}

function cuentasBlock(list, g) {
  const { pays, hay, sinPagador, sets } = calcCuentas(list, g);
  const me = g.persona;
  let body;
  if (!hay && !sets.length) body = h('p', { class: 'hint', style: 'margin:0' }, 'Indica quién ha pagado cada décimo (al editarlo) para ver aquí quién debe dinero.');
  else if (!pays.length) body = h('p', { style: 'margin:0' }, '✅ Todo en orden: nadie debe dinero a nadie.');
  else body = h('div', {}, pays.map(p => h('div', { class: 'debt' + (p.de === me || p.a === me ? ' me' : '') },
    h('span', {}, h('b', {}, p.de), ' debe ', h('b', { class: 'amt' }, eur.format(p.v)), ' a ', h('b', {}, p.a)),
    h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
      if (!await confirmBox('Marcar como pagado', `${p.de} ha pagado ${eur.format(p.v)} a ${p.a}.`, 'Marcar pagado')) return;
      try { await api('POST', '/api/settlements', { group: g.id, from: p.de, to: p.a, amount: p.v }); await loadData(); renderMain(); toast('Pago registrado'); }
      catch (x) { toast(x.message); }
    } }, 'Marcar pagado'))));
  return h('div', { class: 'cuentas' },
    h('div', { class: 'cuentas-h' }, '💶 Cuentas'),
    body,
    sinPagador ? h('p', { class: 'hint', style: 'margin:6px 0 0' }, sinPagador + (sinPagador === 1 ? ' décimo sin pagador indicado' : ' décimos sin pagador indicado') + ' (no se cuentan).') : null,
    sets.length ? h('details', { class: 'paid' }, h('summary', {}, `Pagos registrados (${sets.length})`),
      sets.slice().reverse().map(x => h('div', { class: 'paid-row' },
        h('span', {}, `${x.from} pagó ${eur.format(Number(x.amount))} a ${x.to} · ${fmtWhen(x.at)}`),
        h('button', { class: 'link', type: 'button', onclick: async () => {
          try { await api('DELETE', '/api/settlements/' + x.id); await loadData(); renderMain(); toast('Pago deshecho'); } catch (e) { toast(e.message); }
        } }, 'Deshacer')))) : null);
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
        state.groups.length > 1 && grp(t.groupId) ? h('span', { class: 'gtag' }, '🗂 ' + grp(t.groupId).name) : null,
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
  if (!state.groups.length) { sesionesDialog(); return; }
  const editing = !!t;
  let gid = t ? t.groupId : (state.view !== 'all' ? state.view : state.groups[0].id);
  let chosen = new Set(), payer = '';
  const init = g => {
    const same = t && t.groupId === g.id;
    chosen = new Set(same ? partsOf(t, g) : (g.persona ? [g.persona] : []));
    payer = same ? (t.pagadoPor || '') : (g.persona || '');
  };
  init(grp(gid));
  const gbox = h('div', { class: 'chips', style: 'margin-top:2px' });
  const pbox = h('div', { class: 'chips', style: 'margin-top:2px' });
  const paybox = h('div', { class: 'chips', style: 'margin-top:2px' });
  function drawChips() {
    const g = grp(gid);
    gbox.replaceChildren(...state.groups.map(x => h('button', { type: 'button', class: 'chip pchip' + (x.id === gid ? ' on' : ''),
      onclick: () => { if (gid !== x.id) { gid = x.id; init(x); drawChips(); } } }, x.name)));
    pbox.replaceChildren(...namesOf(g).map(n => h('button', { type: 'button', class: 'chip pchip' + (chosen.has(n) ? ' on' : ''),
      onclick: e => { chosen.has(n) ? chosen.delete(n) : chosen.add(n); e.currentTarget.classList.toggle('on', chosen.has(n)); } }, n)));
    paybox.replaceChildren(...[...namesOf(g), ''].map(n => h('button', { type: 'button', class: 'chip pchip' + (payer === n ? ' on' : ''),
      onclick: () => { payer = n; drawChips(); } }, n || 'Nadie aún')));
  }
  drawChips();
  const f = {
    numero: h('input', { class: 'bignum', inputmode: 'numeric', maxlength: 5, pattern: '\\d{5}', placeholder: '00000', required: true, autocomplete: 'off', value: t ? t.numero : '' }),
    decimos: h('input', { type: 'number', min: 1, max: 100, step: 1, required: true, value: t ? t.decimos : 1 }),
    precio: h('input', { type: 'number', min: 0, step: '0.01', required: true, value: t ? t.precio : PRECIO }),
    groupId: { get value() { return gid; } },
    pagadoPor: { get value() { return payer; } },
    participantes: { get value() { return namesOf(grp(gid)).filter(n => chosen.has(n)).join(', '); } },
    notas: h('textarea', { maxlength: 300, rows: 2, value: t ? t.notas : '' })
  };
  f.notas.value = t ? t.notas : '';
  f.numero.addEventListener('input', () => { f.numero.value = f.numero.value.replace(/\D/g, '').slice(0, 5); });
  const err = h('div', { class: 'err', role: 'alert' });

  const form = h('form', { id: 'tform' },
    state.groups.length > 1 ? [h('label', {}, 'Sesión'), gbox] : null,
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

const closeAll = () => document.querySelectorAll('dialog[open]').forEach(d => d.close());

function sesionesDialog() {
  const body = h('div', {});
  function draw() {
    body.replaceChildren(...[
      ...state.groups.map(g => {
        const nm = h('input', { placeholder: 'Añadir nombre', maxlength: 20, 'aria-label': 'Nuevo nombre' });
        const msg = h('div', { class: 'err', role: 'alert' });
        const gn = h('input', { maxlength: 40, value: g.name, 'aria-label': 'Nombre de la sesión' });
        const mn = h('input', { maxlength: 20, value: g.persona, 'aria-label': 'Tu nombre en la sesión' });
        const run = async (fn, ok) => {
          msg.textContent = '';
          try { await fn(); await loadData(); renderMain(); draw(); toast(ok); } catch (x) { msg.textContent = x.message; }
        };
        return h('div', { class: 'sess' },
          h('div', { class: 'sess-h' }, h('b', {}, g.name), h('span', {}, 'Tú: ' + g.persona)),
          h('div', { class: 'sess-code' }, 'Código para invitar: ', h('code', {}, g.code),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              try { await navigator.clipboard.writeText(g.code); toast('Código copiado'); } catch { toast('Copia el código a mano: ' + g.code); }
            } }, 'Copiar')),
          h('div', { class: 'chips' }, g.personas.map(p => h('span', { class: 'chip static' + (p.taken ? '' : ' pend') }, p.name + (p.taken ? '' : ' · sin cuenta')))),
          h('div', { class: 'sess-add' }, nm, h('button', { class: 'btn small ghost', type: 'button', onclick: () =>
            run(() => api('POST', '/api/groups/persona', { group: g.id, name: nm.value }), 'Nombre añadido') }, 'Añadir')),
          h('details', { class: 'sess-set' }, h('summary', {}, '⚙️ Ajustes de la sesión'),
            h('label', {}, 'Nombre de la sesión'),
            h('div', { class: 'sess-add' }, gn, h('button', { class: 'btn small ghost', type: 'button', onclick: () =>
              run(() => api('POST', '/api/groups/rename', { group: g.id, name: gn.value }), 'Sesión renombrada') }, 'Guardar')),
            h('label', {}, 'Tu nombre en esta sesión'),
            h('div', { class: 'sess-add' }, mn, h('button', { class: 'btn small ghost', type: 'button', onclick: () =>
              run(() => api('POST', '/api/groups/me', { group: g.id, name: mn.value }), 'Nombre cambiado') }, 'Guardar')),
            h('div', { class: 'sess-actions' },
              h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
                if (!await confirmBox('Nuevo código', 'El código actual dejará de funcionar. Quien ya está dentro seguirá dentro.', 'Generar código')) return;
                run(() => api('POST', '/api/groups/regen', { group: g.id }), 'Código nuevo generado');
              } }, '🔄 Nuevo código'),
              h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
                if (!await confirmBox('Salir de la sesión', `Dejarás de ver los números de «${g.name}». Si no queda nadie más, la sesión y sus números se borrarán.`, 'Salir', true)) return;
                run(async () => { await api('POST', '/api/groups/leave', { group: g.id }); if (state.view === g.id) state.view = 'all'; }, 'Has salido de la sesión');
              } }, 'Salir de la sesión'))),
          msg);
      }),
      state.groups.length ? null : h('p', {}, 'Todavía no estás en ninguna sesión.'),
      h('div', { class: 'sess-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: joinDialog }, 'Unirme con un código'),
        h('button', { class: 'btn gold', type: 'button', onclick: createDialog }, '+ Crear sesión')),
      h('p', { class: 'hint' }, 'Cada sesión tiene sus propios números, nombres y cuentas. Quien no esté en una sesión no ve sus números. Tú ves todas las tuyas a la vez.')].filter(Boolean));
  }
  draw();
  openDialog('Mis sesiones', body, close => [h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cerrar')]);
}

function joinDialog() {
  const err = h('div', { class: 'err', role: 'alert' });
  const code = h('input', { autocomplete: 'off', autocapitalize: 'none', placeholder: 'Código de la sesión' });
  const box = h('div', {});
  let chooser = null;
  async function check() {
    err.textContent = ''; chooser = null; box.replaceChildren();
    try {
      const g = await api('POST', '/api/group-by-code', { code: code.value });
      chooser = nameChooser(g.personas);
      box.replaceChildren(h('p', { class: 'hint' }, 'Sesión: ', h('b', {}, g.name)), h('label', {}, '¿Quién eres en esta sesión?'), chooser.el);
    } catch (x) { err.textContent = x.message; }
  }
  openDialog('Unirme a una sesión', [h('label', {}, 'Código de la sesión'), code,
    h('button', { class: 'btn small ghost', type: 'button', style: 'margin-top:8px', onclick: check }, 'Comprobar código'), box, err], close => [
    h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn gold', type: 'button', onclick: async () => {
      err.textContent = '';
      if (!chooser) { err.textContent = 'Escribe el código y pulsa «Comprobar código»'; return; }
      if (!chooser.value) { err.textContent = 'Elige o escribe tu nombre'; return; }
      try {
        const r = await api('POST', '/api/groups/join', { code: code.value, persona: chooser.value });
        await loadData(); state.view = r.groupId; closeAll(); renderMain(); toast('Te has unido a la sesión');
      } catch (x) { err.textContent = x.message; }
    } }, 'Unirme')]);
}

function createDialog() {
  const err = h('div', { class: 'err', role: 'alert' });
  const name = h('input', { maxlength: 40, placeholder: 'Ej.: Silvia y yo', required: true });
  const me = h('input', { maxlength: 20, placeholder: 'Tu nombre en esta sesión', value: state.groups[0] ? state.groups[0].persona : '' });
  const others = h('input', { maxlength: 200, placeholder: 'Silvia, Marc… (separados por comas)' });
  openDialog('Crear sesión', [h('label', {}, 'Nombre de la sesión'), name, h('label', {}, 'Tu nombre'), me,
    h('label', {}, 'Otros nombres (opcional)'), others,
    h('p', { class: 'hint' }, 'Al crearla recibirás un código. Quien se registre o se una con ese código entrará solo en esta sesión.'), err], close => [
    h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn gold', type: 'button', onclick: async () => {
      err.textContent = '';
      try {
        const r = await api('POST', '/api/groups', { name: name.value, persona: me.value, others: others.value });
        await loadData(); state.view = r.groupId; closeAll(); renderMain(); toast('Sesión creada'); sesionesDialog();
      } catch (x) { err.textContent = x.message; }
    } }, 'Crear')]);
}

function confirmDelete(t) {
  openDialog('¿Borrar este número?', h('p', {}, `El ${t.numero} se moverá a la papelera para todos los de su sesión. Podrás recuperarlo desde 🕘 Historial.`), close => [
    h('button', { class: 'btn ghost', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn danger', onclick: async () => {
      try { await api('DELETE', '/api/tickets/' + t.id); await loadData(); close(); renderMain(); toast('Movido a la papelera'); }
      catch (x) { toast(x.message); }
    } }, 'Mover a la papelera')]);
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
  const cur = state.draws[date] || null;
  const opened = cur ? cur.updated : null;
  const saved = cur ? cur.results : [];
  const known = [...FIJOS.map(f => f.label), PEDREA.label, 'Reintegro'];
  const vals = FIJOS.map(f => { const g = saved.find(r => r.label === f.label); return Array.from({ length: f.slots }, (_, i) => (g && g.numeros[i]) || ''); });
  const ped = saved.find(r => r.label === PEDREA.label);
  const extras = [];
  for (const r of saved) if (!known.includes(r.label)) for (const n of r.numeros) extras.push({ numero: n, label: r.label, euros: r.euros });
  const err = h('div', { class: 'err', role: 'alert' });
  const oficialMsg = h('div', { class: 'hint', style: 'margin-top:6px' });
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
    cur ? h('p', { class: 'hint', style: 'margin-bottom:8px' }, `Última modificación: ${cur.updatedBy}, ${fmtWhen(cur.updated)}. `,
      h('button', { class: 'link', type: 'button', onclick: () => historyDialog() }, 'Ver cambios y restaurar')) : null,
    h('div', { class: 'oficial' }, h('button', { class: 'btn small gold', type: 'button', onclick: async e => {
      const b = e.currentTarget; b.disabled = true; oficialMsg.textContent = 'Consultando…';
      try {
        const o = await fetchOficial();
        if (!o.results) { oficialMsg.textContent = o.state === 'curso' ? 'El sorteo está en marcha pero todavía no hay números publicados.' : 'Todavía no hay resultados oficiales publicados.'; return; }
        const hay = state.draws[date];
        if (hay && resKey(hay.results) !== resKey(o.results) && !await confirmBox('Cargar resultados oficiales', 'Se sustituirán los resultados guardados por los oficiales. Podrás volver atrás desde el Historial.', 'Cargar', true)) { oficialMsg.textContent = ''; return; }
        state.draws = (await api('PUT', '/api/draws/oficial', { results: o.results })).draws;
        closeAll(); renderMain(); toast(o.state === 'listo' ? 'Resultados oficiales cargados' : 'Cargados (el sorteo sigue en marcha)');
      } catch (x) { oficialMsg.textContent = 'No se han podido consultar: ' + x.message; } finally { b.disabled = false; }
    } }, '📥 Cargar resultados oficiales'), oficialMsg),
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
          const fresh = (await api('GET', '/api/data')).draws[date] || null;
          const freshUpd = fresh ? fresh.updated : null;
          if (freshUpd !== opened) {
            if (!await confirmBox('Los resultados han cambiado', `${fresh ? fresh.updatedBy : 'Alguien'} los ha modificado mientras los editabas. Si guardas, se sustituirán por lo que ves aquí (se podrá volver atrás desde el Historial).`, 'Sobrescribir', true)) return;
          } else if (fresh && JSON.stringify(fresh.results) !== JSON.stringify(results)) {
            if (!await confirmBox('Modificar resultados', `Ya hay resultados guardados por ${fresh.updatedBy} (${fmtWhen(fresh.updated)}). ¿Quieres sustituirlos? Se podrá volver atrás desde el Historial.`, 'Sustituir', true)) return;
          } else if (fresh) { close(); toast('Sin cambios'); return; }
          state.draws = (await api('PUT', '/api/draws/' + date, { results })).draws;
          close(); renderMain(); toast('Resultados guardados');
        } catch (x) { err.textContent = x.message; }
      } }, 'Guardar y comprobar')]);
}

// ---------- cuenta, cuenta atrás, confirmaciones ----------
async function logout() {
  await api('POST', '/api/logout', {});
  state.me = null; state.groups = []; state.tickets = []; state.settlements = [];
  closeAll(); renderLogin();
}

function confirmBox(title, text, ok = 'Aceptar', danger = false) {
  return new Promise(res => {
    let done = false;
    const dlg = openDialog(title, h('p', {}, text), close => [
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'gold'), type: 'button', onclick: () => { done = true; close(); } }, ok)]);
    dlg.addEventListener('close', () => res(done));
  });
}

function countdown() {
  const now = new Date();
  const days = Math.round((Date.UTC(2026, 11, 22) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (days > 0) return h('div', { class: 'countdown' }, '🎄 ', h('b', {}, days), days === 1 ? ' día para el Sorteo de Navidad' : ' días para el Sorteo de Navidad');
  if (days === 0) return h('div', { class: 'countdown hoy' }, '🎄 ¡Hoy es el Sorteo de Navidad! Suerte a todos');
  if (!state.draws[SORTEO]) return h('div', { class: 'countdown' }, 'El sorteo ya se celebró. Pulsa «Resultados» para comprobar vuestros números.');
  return null;
}

function accountDialog() {
  const o = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Contraseña actual' });
  const n = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Nueva contraseña' });
  const r = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Repite la nueva contraseña' });
  const err = h('div', { class: 'err', role: 'alert' });
  openDialog('👤 ' + state.me.username, [
    h('label', {}, 'Contraseña actual'), o, h('label', {}, 'Nueva contraseña (mínimo 6 caracteres)'), n, h('label', {}, 'Repite la nueva contraseña'), r, err,
    h('p', { class: 'hint' }, 'Al cambiarla, se cerrará tu sesión en los demás dispositivos.')],
    close => [
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cerrar'),
      h('button', { class: 'btn gold', type: 'button', onclick: async () => {
        err.textContent = '';
        if (n.value.length < 6) { err.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
        if (n.value !== r.value) { err.textContent = 'Las contraseñas nuevas no coinciden'; return; }
        try { await api('POST', '/api/password', { old: o.value, new: n.value }); close(); toast('Contraseña cambiada'); }
        catch (x) { err.textContent = x.message; }
      } }, 'Cambiar contraseña')]);
}

// ---------- historial y papelera ----------
const FIELD = { numero: 'Número', decimos: 'Décimos', precio: 'Precio', participantes: 'Con', pagadoPor: 'Pagó', notas: 'Notas', groupId: 'Sesión' };
function diffText(o, n) {
  const val = (k, v) => k === 'groupId' ? ((grp(v) || {}).name || '—') : (v === '' || v == null ? '—' : String(v));
  return Object.keys(FIELD).filter(k => String(o[k] ?? '') !== String(n[k] ?? '')).map(k => `${FIELD[k]}: ${val(k, o[k])} → ${val(k, n[k])}`).join('; ') || 'sin cambios';
}
function logLine(e) {
  const ses = state.groups.length > 1 && grp(e.groupId) ? ` (${grp(e.groupId).name})` : '';
  if (e.action === 'crear') return `${e.by} apuntó el ${e.new.numero} ×${e.new.decimos}${ses}`;
  if (e.action === 'borrar') return `${e.by} borró el ${e.old.numero}${ses}`;
  if (e.action === 'restaurar') return `${e.by} restauró el ${e.new.numero}${ses}`;
  return `${e.by} editó el ${e.new.numero}${ses}: ${diffText(e.old, e.new)}`;
}
async function historyDialog() {
  const body = h('div', {}, h('p', { class: 'hint' }, 'Cargando…'));
  openDialog('🕘 Historial', body, close => [h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cerrar')]);
  async function load() {
    let d;
    try { d = await api('GET', '/api/history'); } catch (x) { body.replaceChildren(h('p', { class: 'err' }, x.message)); return; }
    const after = async (fn, ok) => { try { await fn(); await loadData(); renderMain(); toast(ok); await load(); } catch (x) { toast(x.message); } };
    body.replaceChildren(...[
      h('div', { class: 'cuentas-h' }, '🗑 Papelera'),
      d.trash.length ? d.trash.map(t => h('div', { class: 'hist-row' },
        h('span', {}, h('b', {}, t.numero), ` ×${t.decimos} · borrado por ${t.deletedBy}, ${fmtWhen(t.deletedAt)}` + (state.groups.length > 1 && grp(t.groupId) ? ` · ${grp(t.groupId).name}` : '')),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => after(() => api('POST', `/api/tickets/${t.id}/restore`, {}), 'Número restaurado') }, 'Restaurar')))
        : h('p', { class: 'hint' }, 'La papelera está vacía.'),
      h('div', { class: 'cuentas-h', style: 'margin-top:14px' }, '🏆 Cambios en los resultados'),
      d.drawLog.length ? d.drawLog.map(l => h('div', { class: 'hist-row' },
        h('span', {}, `${l.by} · ${fmtWhen(l.at)}`),
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          if (!await confirmBox('Restaurar resultados', l.hadOld ? 'Los resultados volverán a como estaban justo antes de este cambio.' : 'Se quitarán los resultados que se guardaron en este cambio.', 'Restaurar', true)) return;
          after(async () => { state.draws = (await api('POST', '/api/draws/restore', { id: l.id })).draws; }, 'Resultados restaurados');
        } }, l.hadOld ? 'Volver a la anterior' : 'Quitar')))
        : h('p', { class: 'hint' }, 'Todavía nadie ha guardado resultados.'),
      h('div', { class: 'cuentas-h', style: 'margin-top:14px' }, '📝 Últimos cambios en números'),
      d.log.length ? d.log.map(e => h('div', { class: 'hist-row' }, h('span', {}, logLine(e), h('small', {}, ' · ' + fmtWhen(e.at)))))
        : h('p', { class: 'hint' }, 'Sin cambios todavía.')].flat().filter(Boolean));
  }
  load();
}

// ---------- compartir y exportar ----------
function visibleGroups() { return state.view === 'all' ? state.groups : [grp(state.view)].filter(Boolean); }
function summaryText() {
  const parts = visibleGroups().map(g => {
    const list = state.tickets.filter(t => t.groupId === g.id).sort((a, b) => a.numero.localeCompare(b.numero));
    if (!list.length) return null;
    const lines = [`🎄 ${g.name} · Lotería de Navidad`];
    for (const t of list) {
      const p = prizesFor(t), ppl = partsOf(t, g);
      lines.push(`• ${t.numero} ×${t.decimos}${ppl.length ? ' (' + ppl.join(', ') + ')' : ''}${p ? (p.total > 0 ? ' → ' + eur.format(p.total) : ' → sin premio') : ''}`);
    }
    const inv = list.reduce((x, t) => x + t.precio * t.decimos, 0);
    let won = 0, drawn = false;
    for (const t of list) { const p = prizesFor(t); if (p) { drawn = true; won += p.total; } }
    lines.push(`Jugado: ${eur.format(inv)}` + (drawn ? ` · Premios: ${eur.format(won)}` : ''));
    const c = calcCuentas(list, g);
    if (c.pays.length) { lines.push('💶 Cuentas pendientes:'); for (const x of c.pays) lines.push(`• ${x.de} debe ${eur.format(x.v)} a ${x.a}`); }
    else if (c.hay || c.sets.length) lines.push('✅ Cuentas al día');
    return lines.join('\n');
  }).filter(Boolean);
  return parts.length ? parts.join('\n\n') : 'Todavía no hay números apuntados.';
}
function csvText() {
  const q = v => { let x = String(v ?? ''); if (/^[=+\-@]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
  const num = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const rows = [['Sesión', 'Número', 'Décimos', 'Precio décimo', 'Total', 'Participantes', 'Pagó', 'Premio', 'Notas', 'Apuntado por'].map(q).join(';')];
  for (const g of visibleGroups()) {
    for (const t of state.tickets.filter(t => t.groupId === g.id).sort((a, b) => a.numero.localeCompare(b.numero))) {
      const p = prizesFor(t);
      rows.push([q(g.name), '="' + t.numero + '"', t.decimos, num(t.precio), num(t.precio * t.decimos), q(t.participantes), q(t.pagadoPor || ''),
        p ? num(p.total) : '', q(t.notas), q(t.createdBy)].join(';'));
    }
  }
  return '﻿' + rows.join('\r\n');
}
function shareDialog() {
  const text = summaryText();
  const ta = h('textarea', { rows: 12, readonly: true, 'aria-label': 'Resumen', style: 'font-size:.85rem' });
  ta.value = text;
  openDialog('📤 Compartir resumen', [ta,
    h('div', { class: 'sess-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast('Resumen copiado'); } catch { ta.select(); toast('Selecciona y copia el texto'); }
      } }, 'Copiar'),
      h('a', { class: 'btn gold', href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => {
        const url = URL.createObjectURL(new Blob([csvText()], { type: 'text/csv;charset=utf-8' }));
        const a = h('a', { href: url, download: 'decims-i-numeros.csv' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      } }, '⬇️ CSV (Excel)'))],
    close => [h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cerrar')]);
}

// ---------- resultados oficiales (fuente pública: api-loteria.pabloclementeperez.com, datos de RTVE) ----------
const OFICIAL = 'https://api-loteria.pabloclementeperez.com/output/';
const SORTEO_INICIO = new Date('2026-12-22T09:00:00+01:00');
const AUTO = 'Oficial (auto)';
const resKey = r => r.map(x => x.label + '|' + Number(x.euros) + '|' + [...x.numeros].sort().join(',')).sort().join(';');
// Devuelve { state, results? }. state: 'espera' | 'curso' | 'listo' | 'error'
async function fetchOficial() {
  const get = async f => { const r = await fetch(OFICIAL + f, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const cs = await get('LoteriaNavidadCurrentStatus.json');
  if (cs.year !== 2026 || !(cs.status >= 1)) return { state: 'espera' };
  const rs = await get('LoteriaNavidadResumen.json');
  if (new Date(rs.timestamp * 1000) < SORTEO_INICIO) return { state: 'espera' };
  const n = i => { const v = rs['numero' + i]; return v == null || v === '' || (Number(v) === 0 && cs.status === 1) ? null : pad5(Number(v)); };
  const results = [];
  const slots = [[1, 'El Gordo', 400000], [2, '2º premio', 125000], [3, '3er premio', 50000], [4, '4º premio', 20000], [5, '4º premio', 20000], ...[6, 7, 8, 9, 10, 11, 12, 13].map(i => [i, '5º premio', 6000])];
  for (const [i, label, euros] of slots) {
    const v = n(i); if (!v) continue;
    const ex = results.find(r => r.label === label);
    if (ex) { if (!ex.numeros.includes(v)) ex.numeros.push(v); } else results.push({ label, euros, numeros: [v] });
  }
  if (!results.length) return { state: 'curso' };
  // Pedrea: números del listado oficial cuyo importe no se explica solo con aproximaciones, centenas, terminaciones y reintegro
  try {
    const list = await get('LoteriaNavidad.json');
    const main = new Set(results.flatMap(r => r.numeros));
    const dg = derivedGroups(results);
    const ped = [];
    for (const [k, v] of Object.entries(list)) {
      if (k === 'status' || k === 'year') continue;
      const num = pad5(Number(k));
      if (main.has(num)) continue;
      const rest = Number(v) / 10 - dg.reduce((a, d) => a + (d.fn(num) ? d.euros : 0), 0);
      if (rest >= 99.9) ped.push(num);
    }
    if (ped.length) results.push({ label: PEDREA.label, euros: PEDREA.euros, numeros: ped.sort() });
  } catch { /* sin listado completo aún: se guardan los principales */ }
  return { state: cs.status >= 2 ? 'listo' : 'curso', results };
}
let autoBusy = false, autoLast = 0;
async function autoOficial() {
  if (autoBusy || !state.me || Date.now() < SORTEO_INICIO.getTime() || Date.now() - autoLast < 90000) return;
  const cur = state.draws[SORTEO];
  if (cur && cur.updatedBy !== AUTO) return; // no pisa lo que alguien haya escrito a mano
  autoBusy = true; autoLast = Date.now();
  try {
    const o = await fetchOficial();
    if (o.results && (!cur || resKey(cur.results) !== resKey(o.results))) {
      state.draws = (await api('PUT', '/api/draws/oficial', { results: o.results })).draws;
      renderMain(); toast('Resultados oficiales cargados');
    }
  } catch { /* sin conexión con la fuente: se reintenta */ } finally { autoBusy = false; }
}

// refresco periódico para ver lo que apuntan los demás
setInterval(async () => {
  if (!state.me || document.hidden || document.querySelector('dialog[open], .menu.open')) return;
  try { await loadData(); renderMain(); } catch (x) { if (x.status === 401) { state.me = null; renderLogin(); } }
}, 20000);
setInterval(() => { if (!document.hidden) autoOficial(); }, 30000);

document.addEventListener('click', () => { const m = document.querySelector('.menu.open'); if (m) m.classList.remove('open'); });
boot();
