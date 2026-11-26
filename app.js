'use strict';
const app = document.getElementById('app');
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

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
function prizesFor(t) {
  const draw = state.draws[t.sorteo];
  if (!draw) return null;
  const hits = draw.results.filter(r => t.numero.endsWith(r.numero));
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
      h('div', { class: 'summary' },
        h('div', {}, h('b', {}, list.reduce((s, t) => s + t.decimos, 0)), h('span', {}, 'Décimos')),
        h('div', {}, h('b', {}, eur.format(invested)), h('span', {}, 'Jugado')),
        h('div', { class: 'win' }, h('b', {}, eur.format(won)), h('span', {}, 'Premios'))),
      list.length ? h('div', { class: 'grid' }, list.map(decimo))
        : h('div', { class: 'empty' }, 'Todavía no hay números apuntados.', h('br'), 'Pulsa «Apuntar número» para empezar.'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:24px' },
        'Los premios se calculan con los resultados que se introducen a mano. Compruébalos siempre con el resultado oficial de Loterías y Apuestas del Estado.')));
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
        h('span', {}, h('b', {}, 'Precio '), eur.format(t.precio))),
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
  const f = {
    numero: h('input', { class: 'bignum', inputmode: 'numeric', maxlength: 5, pattern: '\\d{5}', placeholder: '00000', required: true, autocomplete: 'off', value: t ? t.numero : '' }),
    decimos: h('input', { type: 'number', min: 1, max: 100, step: 1, required: true, value: t ? t.decimos : 1 }),
    precio: h('input', { type: 'number', min: 0, step: '0.01', required: true, value: t ? t.precio : PRECIO }),
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

function resultsDialog(date = SORTEO) {
  let rows = (state.draws[date] ? state.draws[date].results : []).map(r => ({ ...r }));
  const box = h('div', {});
  const err = h('div', { class: 'err', role: 'alert' });

  function draw() {
    box.replaceChildren(
      h('div', { class: 'res-head' }, h('span', {}, 'Número'), h('span', {}, 'Premio'), h('span', {}, '€ / décimo'), h('span')),
      rows.map((r, i) => h('div', { class: 'res-row' },
        h('input', { inputmode: 'numeric', maxlength: 5, value: r.numero, 'aria-label': 'Número premiado', oninput: e => { r.numero = e.target.value.replace(/\D/g, '').slice(0, 5); e.target.value = r.numero; } }),
        h('input', { maxlength: 40, value: r.label, 'aria-label': 'Nombre del premio', oninput: e => { r.label = e.target.value; } }),
        h('input', { type: 'number', min: 0, step: '0.01', value: r.euros, 'aria-label': 'Euros por décimo', oninput: e => { r.euros = e.target.value; } }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Quitar', onclick: () => { rows.splice(i, 1); draw(); } }, '✕'))),
      h('div', { class: 'chips' },
        ['El Gordo', '2º premio', '3er premio', '4º premio', '5º premio', 'Terminación', 'Reintegro', 'Otro'].map(l =>
          h('button', { class: 'chip', type: 'button', onclick: () => { rows.push({ numero: '', label: l === 'Otro' ? '' : l, euros: '' }); draw(); } }, '+ ' + l))),
      h('p', { class: 'hint' }, 'Un número de 5 cifras premia solo a ese número. Con menos cifras (reintegro = 1, terminaciones = 2-4) premia a todos los que acaben así.'));
  }
  draw();

  openDialog('Resultados del Sorteo de Navidad', [box, err,
    h('p', { class: 'hint' }, 'Los resultados se comparten con todos los usuarios.')],
    close => [
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn gold', type: 'button', onclick: async () => {
        err.textContent = '';
        try {
          const results = rows.filter(r => r.numero !== '' || r.euros !== '' || r.label).map(r => ({ numero: r.numero, label: r.label, euros: Number(r.euros) || 0 }));
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
