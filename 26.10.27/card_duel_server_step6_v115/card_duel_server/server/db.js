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

module.exports = db;
