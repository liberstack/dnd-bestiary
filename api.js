/**
 * api.js
 * Única camada que conversa com a D&D 5e API (https://www.dnd5eapi.co).
 * Não mexe em DOM nem guarda estado: só busca e normaliza os dados.
 * Funciona no navegador e no Node 18+ (o build-bestiary.mjs reaproveita este arquivo).
 */

const API = 'https://www.dnd5eapi.co/api/2014';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');
const signed = (n) => (n >= 0 ? `+${n}` : String(n));

const CR_FRACTIONS = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };

/* ------------------------------------------------------------------ */
/* Requisições                                                         */
/* ------------------------------------------------------------------ */

async function getJSON(path, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
    } catch (error) {
      lastError = error;
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (response.ok) return response.json();

    lastError = new Error(`HTTP ${response.status} em ${path}`);
    // Erro do cliente (404, 400...) não adianta repetir; 429 e 5xx sim.
    if (response.status < 500 && response.status !== 429) break;
    await sleep(400 * (attempt + 1));
  }

  throw lastError;
}

/** Lista enxuta: só índice e nome. Os detalhes vêm de fetchMonster. */
export async function fetchMonsterList() {
  const data = await getJSON('/monsters');
  return data.results.map(({ index, name }) => ({ index, name }));
}

export async function fetchMonster(index) {
  const raw = await getJSON(`/monsters/${encodeURIComponent(index)}`);
  return normalizeMonster(raw);
}

/**
 * Busca todas as criaturas com um pequeno pool de requisições paralelas.
 * Devolve { monsters, failed, total }: quem falhar não derruba o resto.
 */
export async function fetchAllMonsters({ concurrency = 8, onProgress } = {}) {
  const list = await fetchMonsterList();
  const total = list.length;
  const monsters = [];
  const failed = [];
  let next = 0;
  let done = 0;

  onProgress?.(0, total);

  async function worker() {
    while (next < total) {
      const { index } = list[next++];
      try {
        monsters.push(await fetchMonster(index));
      } catch {
        failed.push(index);
      }
      onProgress?.(++done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

  monsters.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { monsters, failed, total };
}

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

function formatArmorClass(list = []) {
  return list
    .map(({ type, value, armor }) => {
      let label = type;
      if (type === 'natural') label = 'natural armor';
      else if (type === 'armor') label = armor?.map((a) => a.name.toLowerCase()).join(', ') || 'armor';
      else if (type === 'dex') label = '';
      return label ? `${value} (${label})` : String(value);
    })
    .join(', ');
}

function formatSpeed(speed = {}) {
  const parts = [];
  if (speed.walk) parts.push(speed.walk);
  for (const key of ['burrow', 'climb', 'fly', 'swim']) {
    if (speed[key]) parts.push(`${key} ${speed[key]}`);
  }
  const text = parts.join(', ');
  return speed.hover ? `${text} (hover)` : text || '—';
}

function formatSenses(senses = {}) {
  const parts = [];
  for (const key of ['blindsight', 'darkvision', 'tremorsense', 'truesight']) {
    if (senses[key]) parts.push(`${key} ${senses[key]}`);
  }
  if (senses.passive_perception != null) {
    parts.push(`passive Perception ${senses.passive_perception}`);
  }
  return parts.join(', ');
}

function formatUsage(usage) {
  if (!usage) return '';
  switch (usage.type) {
    case 'per day':
      return `${usage.times}/Day`;
    case 'recharge on roll':
      return `Recharge ${usage.min_value}${usage.min_value < 6 ? '-6' : ''}`;
    case 'recharge after rest':
      return `Recharge after ${(usage.rest_types ?? []).map(capitalize).join(' or ')} Rest`;
    case 'at will':
      return 'At Will';
    default:
      return '';
  }
}

function mapEntries(list = []) {
  return list.map((entry) => ({
    name: entry.name,
    usage: formatUsage(entry.usage),
    desc: entry.desc ?? '',
  }));
}

/** Transforma o JSON cru da API no formato compacto usado pelo app. */
export function normalizeMonster(raw) {
  const proficiencies = raw.proficiencies ?? [];

  const saves = proficiencies
    .filter((p) => p.proficiency.name.startsWith('Saving Throw:'))
    .map((p) => `${capitalize(p.proficiency.name.replace('Saving Throw:', '').trim())} ${signed(p.value)}`);

  const skills = proficiencies
    .filter((p) => p.proficiency.name.startsWith('Skill:'))
    .map((p) => `${p.proficiency.name.replace('Skill:', '').trim()} ${signed(p.value)}`);

  const type = raw.type ?? '';

  return {
    index: raw.index,
    name: raw.name,
    size: raw.size,
    type,
    subtype: raw.subtype ?? '',
    category: type.toLowerCase().startsWith('swarm') ? 'swarm' : type.toLowerCase(),
    alignment: raw.alignment ?? 'unaligned',

    ac: formatArmorClass(raw.armor_class),
    hp: raw.hit_points,
    hpRoll: raw.hit_points_roll ?? raw.hit_dice ?? '',
    speed: formatSpeed(raw.speed),

    abilities: {
      str: raw.strength,
      dex: raw.dexterity,
      con: raw.constitution,
      int: raw.intelligence,
      wis: raw.wisdom,
      cha: raw.charisma,
    },

    saves: saves.join(', '),
    skills: skills.join(', '),
    vulnerabilities: (raw.damage_vulnerabilities ?? []).join('; '),
    resistances: (raw.damage_resistances ?? []).join('; '),
    immunities: (raw.damage_immunities ?? []).join('; '),
    conditionImmunities: (raw.condition_immunities ?? []).map((c) => c.name).join(', '),
    senses: formatSenses(raw.senses),
    languages: raw.languages ?? '',

    cr: raw.challenge_rating,
    crLabel: CR_FRACTIONS[raw.challenge_rating] ?? String(raw.challenge_rating),
    xp: raw.xp ?? 0,
    prof: raw.proficiency_bonus ?? 0,

    traits: mapEntries(raw.special_abilities),
    actions: mapEntries(raw.actions),
    reactions: mapEntries(raw.reactions),
    legendary: mapEntries(raw.legendary_actions),
  };
}
