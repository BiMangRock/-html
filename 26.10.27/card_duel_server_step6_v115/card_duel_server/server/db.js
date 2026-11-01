// db.js — SQLite 연결과 테이블 생성.
// DB 파일은 data/game.db (환경변수 DB_PATH 로 변경 가능). 이 파일만 백업하면 된다.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');   // Node 내장 SQLite (별도 설치·컴파일 불필요, Node 22.13 이상)

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'game.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash     TEXT    NOT NULL,                       -- "scrypt$N$r$p$salt$hash" 형식
  created_at  INTEGER NOT NULL,                       -- epoch ms
  last_login  INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,                    -- 쿠키 토큰의 sha256 (DB가 유출돼도 토큰을 못 쓰게)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 3단계: 계정별 게임 저장 데이터
CREATE TABLE IF NOT EXISTS wallets (                    -- 골드·오늘의 보상 풀·배팅 중인 금액
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gold        INTEGER NOT NULL,
  pool        REAL    NOT NULL,
  pool_day    TEXT    NOT NULL,
  bet         INTEGER NOT NULL DEFAULT 0,
  rev         INTEGER NOT NULL DEFAULT 1,               -- 저장할 때마다 +1 (다른 기기와 충돌 감지용)
  updated_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS decks (                      -- 내 덱 (카드 이름 30개의 JSON 배열)
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deck_json   TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- 4단계: 카드 컬렉션
CREATE TABLE IF NOT EXISTS collection (                 -- 내가 가진 카드 (카드 이름 + 장수)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_name   TEXT    NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_name)
);
CREATE TABLE IF NOT EXISTS collection_init (            -- 스타터 카드를 이미 받은 계정 (한 번만 지급)
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at  INTEGER NOT NULL
);
-- 5단계: 상점
CREATE TABLE IF NOT EXISTS shop_state (                 -- 천장 카운터 (특급 이상 / 전설이 안 나온 연속 팩 수)
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  since_epic    INTEGER NOT NULL DEFAULT 0,
  since_legend  INTEGER NOT NULL DEFAULT 0,
  packs_opened  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pack_log (                   -- 개봉 기록 (팩 1개당 한 줄). 문의·부정 확인용
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at   INTEGER NOT NULL,
  price       INTEGER NOT NULL,
  refund      INTEGER NOT NULL,                         -- 이 팩의 중복 환급 합계
  cards_json  TEXT    NOT NULL,                         -- [{name,rarity,isNew,dup,refund}, …]
  pity_hit    TEXT                                      -- 'epic' | 'legend' | NULL (천장으로 확정된 팩인지)
);
CREATE INDEX IF NOT EXISTS idx_pack_log_user ON pack_log(user_id, id);
CREATE TABLE IF NOT EXISTS adventure_progress (         -- 보스 첫 클리어 기록
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boss_id     TEXT    NOT NULL,
  cleared_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, boss_id)
);
-- 6단계: 유저 대전 기록 (한 판당 한 줄). 보상·하루 한도·전적 계산의 기준
CREATE TABLE IF NOT EXISTS pvp_matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    TEXT    NOT NULL,
  p0          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p1          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winner      INTEGER,                                  -- 이긴 사람의 user id (무승부·무효면 NULL)
  reason      TEXT    NOT NULL,                         -- normal | surrender | timeout | disconnect | turnlimit | void
  turns       INTEGER NOT NULL,
  reward      INTEGER NOT NULL DEFAULT 0,               -- 승자에게 실제로 지급된 골드
  day         TEXT    NOT NULL,                         -- 하루 한도 기준 날짜 (새벽 5시 기준, Economy.dayKey)
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pvp_winner_day ON pvp_matches(winner, day);
CREATE INDEX IF NOT EXISTS idx_pvp_pair_day   ON pvp_matches(p0, p1, day);
`);

// v116: 개발자 권한 + 서버 공용 설정 (보스 목록 등)
if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'is_admin'))
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS app_config (                 -- 모든 유저가 같이 쓰는 설정 (key 하나당 JSON 하나). 지금은 'bosses' 만 사용
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
`);

// v117: 모험 덱 (모험 전용 카드를 넣을 수 있는 두 번째 덱). 없으면 일반 덱으로 모험에 나간다
db.exec(`
CREATE TABLE IF NOT EXISTS adventure_decks (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deck_json   TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL
);
`);

// v117: 모험 보상 묶음 (첫 클리어 때 만든 3묶음. 고르기 전까지 남아 있어서 창을 닫아도 나중에 고를 수 있다)
db.exec(`
CREATE TABLE IF NOT EXISTS adventure_offers (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boss_id      TEXT    NOT NULL,
  bundles_json TEXT    NOT NULL,                         -- [[카드 이름…], …]
  created_at   INTEGER NOT NULL,
  picked_index INTEGER,                                  -- 고른 묶음 번호 (아직이면 NULL)
  picked_at    INTEGER,
  PRIMARY KEY (user_id, boss_id)
);
`);

// v117: 입학(런) — 챕터마다 하나. 입학할 때의 모험 덱이 잠기고(보상 묶음은 여기에 더해짐), 지거나 졸업·자퇴하면 지운다
db.exec(`
CREATE TABLE IF NOT EXISTS adventure_runs (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter      TEXT    NOT NULL,
  deck_json    TEXT    NOT NULL,                         -- 잠긴 덱 (30장 + 고른 보상 묶음)
  cleared_json TEXT    NOT NULL DEFAULT '[]',            -- 이번 입학에서 깬 보스 id
  started_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, chapter)
);
`);

// v127 랭크전: 계정별 랭크 상태 (rank.js 규칙). 판 기록에는 랭크전 여부
db.exec(`
CREATE TABLE IF NOT EXISTS rank_state (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier         INTEGER NOT NULL DEFAULT 0,               -- 0 브론즈 · 1 실버 · 2 골드 · 3 플래티넘 · 4 다이아 · 5 전설
  div          INTEGER NOT NULL DEFAULT 3,               -- 단계 3 → 2 → 1 (전설은 0)
  stars        INTEGER NOT NULL DEFAULT 0,
  streak       INTEGER NOT NULL DEFAULT 0,               -- 랭크전 연승
  floor        INTEGER NOT NULL DEFAULT 0,               -- 강등 방지선 (오른 적 있는 가장 높은 등급)
  legend_wins  INTEGER NOT NULL DEFAULT 0,               -- 전설에서 거둔 승수 (순위 기준)
  legend_at    INTEGER,                                  -- 전설 도착 시각 (같은 승수면 먼저 온 사람이 위)
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rank_legend ON rank_state(tier, legend_wins DESC, legend_at);
`);
if (!db.prepare('PRAGMA table_info(pvp_matches)').all().some(c => c.name === 'ranked'))
  db.exec('ALTER TABLE pvp_matches ADD COLUMN ranked INTEGER NOT NULL DEFAULT 0');

// v136 친구 · 닉네임 · 친구 대전
//  - 닉네임: 아이디와 따로 짓는 이름 (없으면 아이디를 보여 준다). 대소문자 구분 없이 한 명만 쓸 수 있다
//  - 친구는 양쪽 방향으로 두 줄 저장 (A→B, B→A) → "내 친구" 조회가 단순하다
//  - 친구 대전 판은 pvp_matches.friendly=1 (보상·랭크·전적에 안 들어감)
if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'nickname'))
  db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
if (!db.prepare('PRAGMA table_info(pvp_matches)').all().some(c => c.name === 'friendly'))
  db.exec('ALTER TABLE pvp_matches ADD COLUMN friendly INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname COLLATE NOCASE) WHERE nickname IS NOT NULL;
CREATE TABLE IF NOT EXISTS friends (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  since       INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (            -- 보낸 친구 요청 (수락·거절·취소하면 지운다)
  from_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_req_to ON friend_requests(to_id);
`);

module.exports = db;
