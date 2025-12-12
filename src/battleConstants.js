// battleConstants.js
export const KILLED_BY_LABELS = {
  Basic: "기본",
  Fast: "신속",
  Tank: "탱커",
  Ranged: "범위",
  Boss: "보스",
  Protector: "수호",
  Vampire: "벰파",
  Scatter: "분열",
  Ray: "레이",
  Saboteur: "방해",
  Commander: "사령",
  Overcharge: "누리",
};

export const KILLED_BY_COLORS = {
  Basic: "#ff4d4d",
  Fast: "#ffd84d",
  Tank: "#ff9f1a",
  Ranged: "#4deeea",
  Boss: "#c77dff",
  Protector: "#4dff88",
  Vampire: "#ff5c5c",
  Scatter: "#a29bfe",
  Ray: "#ffe066",
  Saboteur: "#ff6b6b",
  Commander: "#ffa94d",
  Overcharge: "#7aa2ff",
};

export const KILLED_BY_SHAPES = {
  Basic: "square",
  Fast: "square",
  Tank: "square",
  Ranged: "square",
  Boss: "square",
  Protector: "square",
  Vampire: "triangle",
  Scatter: "triangle",
  Ray: "triangle",
  Saboteur: "pentagon",
  Commander: "pentagon",
  Overcharge: "pentagon"
};

export const TAB_COLORS = {
  전체: "#8884d8",
  파밍: "#36a2eb",
  토너: "#ff6384",
  등반: "#4bc0c0",
  리롤: "#ffcd56",
};

export const SHORT_NAMES = {
  orb: '오브',
  chainlightning: '체라',
  blackhole: '블홀',
  electrons: '전자',
  projectiles: '투사체',
  deathray: '죽광',
  innerlandmine: '지뢰플',
  swamp:'독늪',
  smartmissile:'스미',
  deathwave:'죽파',
};

export const IGNORE_LIST = [
  "damage taken","damage taken wall","damage taken while berserked",
  "damage gain from berserk","death defy","lifesteal","projectiles count",
  "enemies hit by orbs","land mines spawned","tagged by deathwave"
];

export const PAGE_SIZE = 10;

export const DAMAGE_COLORS = {
  orb: "#fabadaff",
  chainlightning: "#2c3135ff",
  blackhole: "#5d5574ff",
  electrons: "#89f7edd3",
  projectiles: "#e9afdaff",
  deathray: "#fd9c8bff",
  innerlandmine: "#ca8b77ff",
  swamp: "#4d7253ff",
  smartmissile: "#9ef1a2ff",
  deathwave: "#9c7373ff",
};

export const UNIT_LEVEL = {
  K: 1,
  M: 2,
  B: 3,
  T: 4,
  q: 5,
  Q: 6,
};
