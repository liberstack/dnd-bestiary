/**
 * ui.js
 * DOM, renderização e eventos. É o ponto de entrada (carregado pelo index.html).
 * Nunca faz chamada HTTP: pede tudo ao bestiary.js.
 * Todo texto vindo dos dados entra no DOM como texto, nunca como HTML.
 */

import {
  loadBestiary,
  filterMonsters,
  getMonster,
  getAllMonsters,
  getFilterOptions,
  CR_RANGES,
} from './bestiary.js';

const $ = (id) => document.getElementById(id);

const els = {
  browser: $('browser'),
  search: $('search'),
  type: $('filter-type'),
  size: $('filter-size'),
  cr: $('filter-cr'),
  count: $('result-count'),
  notice: $('notice'),
  list: $('list'),
  detail: $('detail'),
};

const state = {
  filters: { query: '', type: '', size: '', cr: '' },
  visible: [],
  selected: null,
};

const ABILITIES = [
  ['str', 'FOR'],
  ['dex', 'DES'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'SAB'],
  ['cha', 'CAR'],
];

const LEGENDARY_INTRO =
  'A criatura pode realizar 3 ações lendárias, escolhidas entre as opções abaixo. ' +
  'Só uma opção pode ser usada por vez, e apenas no fim do turno de outra criatura. ' +
  'As ações lendárias gastas voltam no início do turno da criatura.';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Cria elementos sem innerHTML: strings viram nós de texto. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
const modifier = (score) => {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
};
const scrollBehavior = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const isNarrow = () => matchMedia('(max-width: 860px)').matches;

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

function fillSelect(select, options) {
  const first = select.options[0];
  select.replaceChildren(first, ...options.map(({ value, label }) => el('option', { value }, label)));
}

function renderFilters({ types, sizes }) {
  fillSelect(els.type, types.map((t) => ({ value: t, label: capitalize(t) })));
  fillSelect(els.size, sizes.map((s) => ({ value: s, label: s })));
  fillSelect(els.cr, CR_RANGES.map((r) => ({ value: r.key, label: r.label })));
}

function clearFilters() {
  state.filters = { query: '', type: '', size: '', cr: '' };
  els.search.value = '';
  els.type.value = '';
  els.size.value = '';
  els.cr.value = '';
  applyFilters();
}

function applyFilters() {
  state.visible = filterMonsters(state.filters);
  renderSearchResults(state.visible);
  markSelected(state.selected);
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */

function monsterItem(monster) {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'monster-link', href: `#${encodeURIComponent(monster.index)}`, 'data-index': monster.index },
      el('span', { class: 'monster-name' }, monster.name),
      el('span', { class: 'monster-cr', title: 'Nível de Desafio' }, `ND ${monster.crLabel}`),
      el('span', { class: 'monster-type' }, `${monster.size} ${monster.type}`),
    ),
  );
}

function renderBestiary(monsters) {
  els.list.replaceChildren(el('ul', { class: 'monster-list' }, monsters.map(monsterItem)));
}

function renderSearchResults(monsters) {
  const total = getAllMonsters().length;
  els.count.textContent =
    monsters.length === total
      ? `${total} criaturas`
      : `${monsters.length} de ${total} criaturas`;

  if (!monsters.length) {
    els.list.replaceChildren(
      el(
        'div',
        { class: 'status-box' },
        el('p', {}, 'Nenhuma criatura encontrada. Mude a busca ou limpe os filtros.'),
        el('button', { type: 'button', class: 'btn', 'data-action': 'clear' }, 'Limpar filtros'),
      ),
    );
    return;
  }

  renderBestiary(monsters);
}

function markSelected(index) {
  els.list.querySelector('.monster-link[aria-current]')?.removeAttribute('aria-current');
  if (!index) return;
  const link = els.list.querySelector(`.monster-link[data-index="${CSS.escape(index)}"]`);
  if (!link) return;
  link.setAttribute('aria-current', 'true');
  link.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------------ */
/* Ficha da criatura                                                   */
/* ------------------------------------------------------------------ */

const rule = () => el('div', { class: 'rule', 'aria-hidden': 'true' });

function prop(label, value) {
  if (!value) return null;
  return el('p', { class: 'prop' }, el('strong', {}, label), ' ', value);
}

function abilitiesTable(abilities) {
  return el(
    'table',
    { class: 'abilities' },
    el('caption', { class: 'visually-hidden' }, 'Atributos'),
    el('thead', {}, el('tr', {}, ABILITIES.map(([, label]) => el('th', { scope: 'col' }, label)))),
    el(
      'tbody',
      {},
      el('tr', {}, ABILITIES.map(([key]) => el('td', {}, `${abilities[key]} (${modifier(abilities[key])})`))),
    ),
  );
}

function entry(item) {
  const [first = '', ...rest] = String(item.desc).split('\n').filter(Boolean);
  const title = item.usage ? `${item.name} (${item.usage}).` : `${item.name}.`;
  return el(
    'div',
    { class: 'sb-entry' },
    el('p', {}, el('strong', { class: 'sb-entry-name' }, title), ' ', first),
    rest.map((paragraph) => el('p', {}, paragraph)),
  );
}

function section(title, items, intro) {
  if (!items.length) return null;
  return el(
    'div',
    { class: 'sb-section' },
    el('h3', { class: 'sb-heading' }, title),
    intro ? el('p', { class: 'sb-note' }, intro) : null,
    items.map(entry),
  );
}

function statBlock(m) {
  const kind = `${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''}, ${m.alignment}`;
  const hp = m.hpRoll ? `${m.hp} (${m.hpRoll})` : String(m.hp);

  return el(
    'div',
    { class: 'stat-block' },
    el('h2', { class: 'sb-name' }, m.name),
    el('p', { class: 'sb-kind' }, kind),
    rule(),
    prop('Classe de Armadura', m.ac),
    prop('Pontos de Vida', hp),
    prop('Deslocamento', m.speed),
    rule(),
    abilitiesTable(m.abilities),
    rule(),
    prop('Testes de resistência', m.saves),
    prop('Perícias', m.skills),
    prop('Vulnerabilidades a dano', m.vulnerabilities),
    prop('Resistências a dano', m.resistances),
    prop('Imunidades a dano', m.immunities),
    prop('Imunidades a condição', m.conditionImmunities),
    prop('Sentidos', m.senses),
    prop('Idiomas', m.languages || '—'),
    prop('Nível de Desafio', `${m.crLabel} (${m.xp.toLocaleString('pt-BR')} XP)`),
    prop('Bônus de proficiência', `+${m.prof}`),
    rule(),
    m.traits.map(entry),
    section('Ações', m.actions),
    section('Reações', m.reactions),
    section('Ações Lendárias', m.legendary, LEGENDARY_INTRO),
  );
}

function renderMonster(monster) {
  els.detail.replaceChildren(
    el('button', { type: 'button', class: 'btn back-to-list', 'data-action': 'back' }, 'Voltar à lista'),
    statBlock(monster),
  );
  document.title = `${monster.name} — Bestiário de D&D`;
}

function renderWelcome() {
  els.detail.replaceChildren(
    el(
      'div',
      { class: 'welcome' },
      el('h2', {}, 'Escolha uma criatura'),
      el('p', {}, 'Use a busca e os filtros para achar uma ficha, ou sorteie uma criatura para começar.'),
      el('button', { type: 'button', class: 'btn', 'data-action': 'random' }, 'Sortear criatura'),
    ),
  );
  document.title = 'Bestiário de D&D';
}

function renderNotFound(index) {
  els.detail.replaceChildren(
    el(
      'div',
      { class: 'welcome' },
      el('h2', {}, 'Criatura não encontrada'),
      el('p', {}, `Não existe nenhuma criatura com o código “${index}”. Escolha outra na lista.`),
    ),
  );
  document.title = 'Bestiário de D&D';
}

/* ------------------------------------------------------------------ */
/* Carregamento e erro                                                 */
/* ------------------------------------------------------------------ */

let progressBar = null;

function renderLoading(done = 0, total = 0) {
  if (!progressBar || !progressBar.isConnected) {
    progressBar = el('progress', { max: 1 });
    els.list.replaceChildren(
      el('div', { class: 'status-box' }, el('p', {}, 'Carregando criaturas da API…'), progressBar),
    );
  }
  if (total > 0) {
    progressBar.max = total;
    progressBar.value = done;
    els.count.textContent = `Carregando ${done} de ${total}`;
  }
}

function renderError() {
  els.count.textContent = '';
  els.list.replaceChildren(
    el(
      'div',
      { class: 'status-box' },
      el('p', {}, 'Não foi possível carregar as criaturas. Confira sua conexão e tente de novo.'),
      el('button', { type: 'button', class: 'btn', 'data-action': 'retry' }, 'Tentar de novo'),
    ),
  );
}

function renderNotice(text) {
  els.notice.hidden = !text;
  els.notice.textContent = text ?? '';
}

/* ------------------------------------------------------------------ */
/* Rotas (hash) e ações                                                */
/* ------------------------------------------------------------------ */

function currentIndex() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
}

function route({ fromUser = false } = {}) {
  const index = currentIndex();
  const monster = index ? getMonster(index) : null;

  state.selected = monster?.index ?? null;

  if (monster) renderMonster(monster);
  else if (index) renderNotFound(index);
  else renderWelcome();

  markSelected(state.selected);

  if (fromUser && monster && isNarrow()) {
    els.detail.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
}

function pickRandom() {
  const pool = state.visible.length ? state.visible : getAllMonsters();
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  location.hash = encodeURIComponent(pick.index);
}

function backToList() {
  els.browser.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  (els.list.querySelector('.monster-link[aria-current]') ?? els.search).focus({ preventScroll: true });
}

const actions = {
  clear: clearFilters,
  random: pickRandom,
  back: backToList,
  retry: init,
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) actions[button.dataset.action]?.();
});

els.search.addEventListener('input', () => {
  state.filters.query = els.search.value;
  applyFilters();
});

for (const [key, select] of [['type', els.type], ['size', els.size], ['cr', els.cr]]) {
  select.addEventListener('change', () => {
    state.filters[key] = select.value;
    applyFilters();
  });
}

window.addEventListener('hashchange', () => route({ fromUser: true }));

// Atalho: "/" foca a busca, como em vários sites de documentação.
document.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    els.search.focus();
  }
});

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

async function init() {
  renderNotice('');
  renderLoading();

  try {
    const { failed } = await loadBestiary({ onProgress: renderLoading });

    renderFilters(getFilterOptions());
    applyFilters();
    route();

    if (failed.length) {
      renderNotice(`${failed.length} criaturas não carregaram. Recarregue a página para tentar de novo.`);
    }
  } catch (error) {
    console.error(error);
    renderError();
  }
}

init();
