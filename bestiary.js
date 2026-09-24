/**
 * bestiary.js
 * Dados e lógica do bestiário: carregar, buscar, filtrar, pegar uma criatura.
 * Não mexe em DOM. Só conversa com api.js quando não há dados locais.
 *
 * Ordem de carregamento:
 *   1. data/bestiary.json (gerado por `node build-bestiary.mjs`): o caminho rápido
 *   2. cache no localStorage (de uma carga anterior direto da API)
 *   3. D&D 5e API, uma requisição por criatura (e salva no cache)
 */

import { fetchAllMonsters } from './api.js';

const LOCAL_URL = new URL('./data/bestiary.json', import.meta.url);
const CACHE_KEY = 'dnd-bestiary:v1';

const SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

export const CR_RANGES = [
  { key: '0-1', label: '0 a 1', min: 0, max: 1 },
  { key: '2-4', label: '2 a 4', min: 2, max: 4 },
  { key: '5-10', label: '5 a 10', min: 5, max: 10 },
  { key: '11-16', label: '11 a 16', min: 11, max: 16 },
  { key: '17+', label: '17 ou mais', min: 17, max: Infinity },
];

let monsters = [];
let byIndex = new Map();

/** Minúsculas e sem acentos, para a busca não depender de como a pessoa digita. */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/* ------------------------------------------------------------------ */
/* Carregamento                                                        */
/* ------------------------------------------------------------------ */

async function loadLocal() {
  try {
    const response = await fetch(LOCAL_URL);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Cota cheia ou storage bloqueado: segue sem cache.
  }
}

function setData(list) {
  monsters = [...list].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  byIndex = new Map(monsters.map((m) => [m.index, m]));
}

/**
 * Carrega o bestiário. Devolve { monsters, source, failed }.
 * `source` é 'local', 'cache' ou 'api'; `failed` lista criaturas que não vieram da API.
 */
export async function loadBestiary({ onProgress } = {}) {
  const local = await loadLocal();
  if (local.length) {
    setData(local);
    return { monsters, source: 'local', failed: [] };
  }

  const cached = readCache();
  if (cached.length) {
    setData(cached);
    return { monsters, source: 'cache', failed: [] };
  }

  const result = await fetchAllMonsters({ onProgress });
  if (!result.monsters.length) {
    throw new Error('A API não devolveu nenhuma criatura.');
  }

  setData(result.monsters);
  if (!result.failed.length) writeCache(result.monsters);
  return { monsters, source: 'api', failed: result.failed };
}

/* ------------------------------------------------------------------ */
/* Consulta                                                            */
/* ------------------------------------------------------------------ */

export const getAllMonsters = () => monsters;

export const getMonster = (index) => byIndex.get(index) ?? null;

/** Busca só por nome. */
export function searchMonsters(query) {
  return filterMonsters({ query });
}

/** Combina busca por nome com tipo, tamanho e faixa de Nível de Desafio. */
export function filterMonsters({ query = '', type = '', size = '', cr = '' } = {}) {
  const needle = fold(query.trim());
  const range = CR_RANGES.find((r) => r.key === cr);

  return monsters.filter((m) => {
    if (type && m.category !== type) return false;
    if (size && m.size !== size) return false;
    if (range && (m.cr < range.min || m.cr > range.max)) return false;
    if (needle && !fold(m.name).includes(needle)) return false;
    return true;
  });
}

/** Valores disponíveis para os filtros, já ordenados. */
export function getFilterOptions() {
  const types = [...new Set(monsters.map((m) => m.category))].sort();
  const present = new Set(monsters.map((m) => m.size));
  const sizes = SIZE_ORDER.filter((s) => present.has(s));
  return { types, sizes };
}
