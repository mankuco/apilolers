"""
Database layer for the LoL Tournament Manager.
Uses SQLite for portability.

v2 – Added: last_played, puuid on players; tournament_codes table;
     match_performances table; status/riot_match_id/duration on matches.
"""

import sqlite3
import json
import os
from datetime import datetime
from typing import Optional


# Store DB in a writable location; fall back to script dir if needed
_DEFAULT_DIR = os.environ.get("TOURNAMENT_DB_DIR", os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_DEFAULT_DIR, "tournament.db")


def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str = DB_PATH):
    conn = get_connection(db_path)
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS players (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        lol_name_tag    TEXT NOT NULL UNIQUE,
        puuid           TEXT,
        api_elo         REAL NOT NULL DEFAULT 1200,
        tournament_elo  REAL NOT NULL DEFAULT 1200,
        games_played    INTEGER NOT NULL DEFAULT 0,
        wins            INTEGER NOT NULL DEFAULT 0,
        losses          INTEGER NOT NULL DEFAULT 0,
        mvp_count       INTEGER NOT NULL DEFAULT 0,
        ace_count       INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1,
        last_played     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS champion_stats (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id   INTEGER NOT NULL REFERENCES players(id),
        champion    TEXT NOT NULL,
        wins        INTEGER NOT NULL DEFAULT 0,
        losses      INTEGER NOT NULL DEFAULT 0,
        picks       INTEGER NOT NULL DEFAULT 0,
        bans        INTEGER NOT NULL DEFAULT 0,
        UNIQUE(player_id, champion)
    );

    CREATE TABLE IF NOT EXISTS matches (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp         TEXT NOT NULL DEFAULT (datetime('now')),
        team_blue         TEXT NOT NULL,
        team_red          TEXT NOT NULL,
        avg_blue_elo      REAL NOT NULL,
        avg_red_elo       REAL NOT NULL,
        picks_blue        TEXT NOT NULL DEFAULT '[]',
        picks_red         TEXT NOT NULL DEFAULT '[]',
        bans_blue         TEXT NOT NULL DEFAULT '[]',
        bans_red          TEXT NOT NULL DEFAULT '[]',
        winner            TEXT CHECK(winner IN ('Blue', 'Red', NULL)),
        mvp_player_id     INTEGER REFERENCES players(id),
        ace_player_id     INTEGER REFERENCES players(id),
        elo_changes       TEXT NOT NULL DEFAULT '{}',
        tournament_code   TEXT,
        riot_match_id     TEXT,
        duration_seconds  INTEGER,
        status            TEXT NOT NULL DEFAULT 'completed'
                          CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS elo_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id   INTEGER NOT NULL REFERENCES players(id),
        match_id    INTEGER NOT NULL REFERENCES matches(id),
        elo_before  REAL NOT NULL,
        elo_after   REAL NOT NULL,
        timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournament_codes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code            TEXT NOT NULL UNIQUE,
        match_id        INTEGER REFERENCES matches(id),
        tournament_id   INTEGER,
        riot_match_id   TEXT,
        status          TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active', 'used', 'expired', 'cancelled')),
        metadata        TEXT NOT NULL DEFAULT '{}',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS match_performances (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id                INTEGER NOT NULL REFERENCES matches(id),
        player_id               INTEGER NOT NULL REFERENCES players(id),
        champion                TEXT,
        kills                   INTEGER NOT NULL DEFAULT 0,
        deaths                  INTEGER NOT NULL DEFAULT 0,
        assists                 INTEGER NOT NULL DEFAULT 0,
        total_damage_to_champions INTEGER NOT NULL DEFAULT 0,
        vision_score            INTEGER NOT NULL DEFAULT 0,
        cs                      INTEGER NOT NULL DEFAULT 0,
        gold_earned             INTEGER NOT NULL DEFAULT 0,
        kill_participation      REAL NOT NULL DEFAULT 0,
        performance_score       REAL NOT NULL DEFAULT 0,
        UNIQUE(match_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS riot_config (
        id              INTEGER PRIMARY KEY CHECK(id = 1),
        provider_id     INTEGER,
        tournament_id   INTEGER,
        callback_url    TEXT,
        region          TEXT NOT NULL DEFAULT 'EUW',
        use_stub        INTEGER NOT NULL DEFAULT 1,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duel_matches (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
        player1_id      INTEGER NOT NULL REFERENCES players(id),
        player2_id      INTEGER NOT NULL REFERENCES players(id),
        champion1       TEXT NOT NULL DEFAULT '',
        champion2       TEXT NOT NULL DEFAULT '',
        ban1            TEXT NOT NULL DEFAULT '',
        ban2            TEXT NOT NULL DEFAULT '',
        winner_id       INTEGER NOT NULL REFERENCES players(id),
        win_condition   TEXT NOT NULL DEFAULT 'first_kill'
                        CHECK(win_condition IN ('first_kill', 'first_tower', 'cs_100')),
        elo_before_1    REAL NOT NULL DEFAULT 1200,
        elo_after_1     REAL NOT NULL DEFAULT 1200,
        elo_before_2    REAL NOT NULL DEFAULT 1200,
        elo_after_2     REAL NOT NULL DEFAULT 1200
    );

    CREATE TABLE IF NOT EXISTS duel_ratings (
        player_id       INTEGER PRIMARY KEY REFERENCES players(id),
        elo             REAL NOT NULL DEFAULT 1200,
        games           INTEGER NOT NULL DEFAULT 0,
        wins            INTEGER NOT NULL DEFAULT 0,
        losses          INTEGER NOT NULL DEFAULT 0,
        win_streak      INTEGER NOT NULL DEFAULT 0,
        best_streak     INTEGER NOT NULL DEFAULT 0
    );
    """)

    conn.commit()

    # Migration: add columns if they don't exist (for existing DBs)
    _migrate(conn)

    conn.close()


def _migrate(conn: sqlite3.Connection):
    """Add columns that might be missing in older DB versions."""
    cur = conn.cursor()

    # Check players columns
    cols = {row[1] for row in cur.execute("PRAGMA table_info(players)").fetchall()}
    if "puuid" not in cols:
        cur.execute("ALTER TABLE players ADD COLUMN puuid TEXT")
    if "last_played" not in cols:
        cur.execute("ALTER TABLE players ADD COLUMN last_played TEXT")

    # Check matches columns
    cols = {row[1] for row in cur.execute("PRAGMA table_info(matches)").fetchall()}
    if "tournament_code" not in cols:
        cur.execute("ALTER TABLE matches ADD COLUMN tournament_code TEXT")
    if "riot_match_id" not in cols:
        cur.execute("ALTER TABLE matches ADD COLUMN riot_match_id TEXT")
    if "duration_seconds" not in cols:
        cur.execute("ALTER TABLE matches ADD COLUMN duration_seconds INTEGER")
    if "status" not in cols:
        cur.execute("ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'")

    # Add archived column to matches
    if "archived" not in cols:
        cur.execute("ALTER TABLE matches ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")

    # Backfill last_played for players who have matches but null last_played
    cur.execute("""
        UPDATE players SET last_played = (
            SELECT MAX(m.timestamp)
            FROM elo_history eh
            JOIN matches m ON m.id = eh.match_id
            WHERE eh.player_id = players.id
        )
        WHERE last_played IS NULL
        AND games_played > 0
    """)

    conn.commit()


# ── Player CRUD ──────────────────────────────────────────────────────────────

def add_player(name: str, lol_name_tag: str, api_elo: float,
               tournament_elo: Optional[float] = None, puuid: Optional[str] = None,
               db_path: str = DB_PATH) -> int:
    if tournament_elo is None:
        tournament_elo = api_elo
    conn = get_connection(db_path)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO players (name, lol_name_tag, api_elo, tournament_elo, puuid) VALUES (?, ?, ?, ?, ?)",
        (name, lol_name_tag, api_elo, tournament_elo, puuid),
    )
    pid = cur.lastrowid
    conn.commit()
    conn.close()
    return pid


def get_all_players(active_only: bool = True, db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    q = "SELECT * FROM players"
    if active_only:
        q += " WHERE active = 1"
    q += " ORDER BY tournament_elo DESC"
    rows = conn.execute(q).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_player(player_id: int, db_path: str = DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM players WHERE id = ?", (player_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_player_elo(player_id: int, new_elo: float, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE players SET tournament_elo = ? WHERE id = ?", (new_elo, player_id))
    conn.commit()
    conn.close()


def update_player_stats(player_id: int, won: bool, is_mvp: bool = False,
                        is_ace: bool = False, timestamp: Optional[str] = None,
                        db_path: str = DB_PATH):
    conn = get_connection(db_path)
    ts_expr = "?" if timestamp else "datetime('now')"
    conn.execute(f"""
        UPDATE players SET
            games_played = games_played + 1,
            wins = wins + CASE WHEN ? THEN 1 ELSE 0 END,
            losses = losses + CASE WHEN ? THEN 0 ELSE 1 END,
            mvp_count = mvp_count + CASE WHEN ? THEN 1 ELSE 0 END,
            ace_count = ace_count + CASE WHEN ? THEN 1 ELSE 0 END,
            last_played = CASE
                WHEN last_played IS NULL OR last_played < {ts_expr} THEN {ts_expr}
                ELSE last_played
            END
        WHERE id = ?
    """, (won, won, is_mvp, is_ace, *([timestamp, timestamp] if timestamp else []), player_id))
    conn.commit()
    conn.close()


def update_player_puuid(player_id: int, puuid: str, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE players SET puuid = ? WHERE id = ?", (puuid, player_id))
    conn.commit()
    conn.close()


def archive_player(player_id: int, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE players SET active = 0 WHERE id = ?", (player_id,))
    conn.commit()
    conn.close()


def reactivate_player(player_id: int, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE players SET active = 1 WHERE id = ?", (player_id,))
    conn.commit()
    conn.close()


def get_average_tournament_elo(db_path: str = DB_PATH) -> float:
    conn = get_connection(db_path)
    row = conn.execute(
        "SELECT AVG(tournament_elo) as avg_elo FROM players WHERE active = 1"
    ).fetchone()
    conn.close()
    return row["avg_elo"] if row["avg_elo"] else 1200.0


def update_player_api_elo(player_id: int, api_elo: float, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE players SET api_elo = ? WHERE id = ?", (api_elo, player_id))
    conn.commit()
    conn.close()


# ── Champion Stats ───────────────────────────────────────────────────────────

def update_champion_stat(player_id: int, champion: str, won: bool,
                         picked: bool = True, banned: bool = False,
                         db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("""
        INSERT INTO champion_stats (player_id, champion, wins, losses, picks, bans)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id, champion) DO UPDATE SET
            wins  = wins  + excluded.wins,
            losses = losses + excluded.losses,
            picks = picks + excluded.picks,
            bans  = bans  + excluded.bans
    """, (
        player_id, champion,
        1 if (won and picked) else 0,
        1 if (not won and picked) else 0,
        1 if picked else 0,
        1 if banned else 0,
    ))
    conn.commit()
    conn.close()


def get_player_champion_stats(player_id: int, db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM champion_stats WHERE player_id = ? ORDER BY picks DESC",
        (player_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_global_champion_stats(db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    rows = conn.execute("""
        SELECT champion,
               SUM(picks) as total_picks,
               SUM(bans)  as total_bans,
               SUM(wins)  as total_wins,
               SUM(losses) as total_losses
        FROM champion_stats
        GROUP BY champion
        ORDER BY total_picks DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Match CRUD ───────────────────────────────────────────────────────────────

def save_match(team_blue: list[int], team_red: list[int],
               avg_blue_elo: float, avg_red_elo: float,
               picks_blue: list[str], picks_red: list[str],
               bans_blue: list[str], bans_red: list[str],
               winner: str, mvp_id: Optional[int], ace_id: Optional[int],
               elo_changes: dict, timestamp: Optional[str] = None,
               tournament_code: Optional[str] = None,
               riot_match_id: Optional[str] = None,
               duration_seconds: Optional[int] = None,
               status: str = "completed",
               db_path: str = DB_PATH) -> int:
    conn = get_connection(db_path)
    cur = conn.cursor()
    ts = timestamp or datetime.now().isoformat()
    cur.execute("""
        INSERT INTO matches
        (timestamp, team_blue, team_red, avg_blue_elo, avg_red_elo,
         picks_blue, picks_red, bans_blue, bans_red, winner,
         mvp_player_id, ace_player_id, elo_changes,
         tournament_code, riot_match_id, duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ts,
        json.dumps(team_blue), json.dumps(team_red),
        avg_blue_elo, avg_red_elo,
        json.dumps(picks_blue), json.dumps(picks_red),
        json.dumps(bans_blue), json.dumps(bans_red),
        winner, mvp_id, ace_id,
        json.dumps(elo_changes),
        tournament_code, riot_match_id, duration_seconds, status,
    ))
    match_id = cur.lastrowid
    conn.commit()
    conn.close()
    return match_id


def create_pending_match(team_blue: list[int], team_red: list[int],
                         avg_blue_elo: float, avg_red_elo: float,
                         tournament_code: Optional[str] = None,
                         db_path: str = DB_PATH) -> int:
    """Create a match with status=pending (before game is played)."""
    return save_match(
        team_blue, team_red, avg_blue_elo, avg_red_elo,
        [""] * 5, [""] * 5, [""] * 5, [""] * 5,
        None, None, None, {},
        tournament_code=tournament_code,
        status="pending",
        db_path=db_path,
    )


def update_match_status(match_id: int, status: str, db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("UPDATE matches SET status = ? WHERE id = ?", (status, match_id))
    conn.commit()
    conn.close()


def update_match_result(match_id: int, winner: str, mvp_id: Optional[int],
                        ace_id: Optional[int], elo_changes: dict,
                        picks_blue: list[str] = None, picks_red: list[str] = None,
                        bans_blue: list[str] = None, bans_red: list[str] = None,
                        riot_match_id: Optional[str] = None,
                        duration_seconds: Optional[int] = None,
                        db_path: str = DB_PATH):
    conn = get_connection(db_path)
    sets = ["winner = ?", "mvp_player_id = ?", "ace_player_id = ?",
            "elo_changes = ?", "status = 'completed'"]
    params = [winner, mvp_id, ace_id, json.dumps(elo_changes)]

    if picks_blue is not None:
        sets.append("picks_blue = ?")
        params.append(json.dumps(picks_blue))
    if picks_red is not None:
        sets.append("picks_red = ?")
        params.append(json.dumps(picks_red))
    if bans_blue is not None:
        sets.append("bans_blue = ?")
        params.append(json.dumps(bans_blue))
    if bans_red is not None:
        sets.append("bans_red = ?")
        params.append(json.dumps(bans_red))
    if riot_match_id is not None:
        sets.append("riot_match_id = ?")
        params.append(riot_match_id)
    if duration_seconds is not None:
        sets.append("duration_seconds = ?")
        params.append(duration_seconds)

    params.append(match_id)
    conn.execute(f"UPDATE matches SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    conn.close()


def get_match(match_id: int, db_path: str = DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    conn.close()
    return _parse_match_row(row) if row else None


def get_match_by_tournament_code(code: str, db_path: str = DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM matches WHERE tournament_code = ?", (code,)).fetchone()
    conn.close()
    return _parse_match_row(row) if row else None


def save_elo_snapshot(player_id: int, match_id: int,
                      elo_before: float, elo_after: float,
                      db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO elo_history (player_id, match_id, elo_before, elo_after) VALUES (?, ?, ?, ?)",
        (player_id, match_id, elo_before, elo_after),
    )
    conn.commit()
    conn.close()


def _parse_match_row(r) -> dict:
    """Convert a raw match row into a dict with JSON fields parsed."""
    d = dict(r)
    d["team_blue"] = json.loads(d["team_blue"])
    d["team_red"] = json.loads(d["team_red"])
    d["picks_blue"] = json.loads(d["picks_blue"])
    d["picks_red"] = json.loads(d["picks_red"])
    d["bans_blue"] = json.loads(d["bans_blue"])
    d["bans_red"] = json.loads(d["bans_red"])
    d["elo_changes"] = json.loads(d["elo_changes"])
    return d


def get_all_matches(include_archived: bool = False, db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    if include_archived:
        rows = conn.execute("SELECT * FROM matches ORDER BY timestamp DESC").fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM matches WHERE archived = 0 ORDER BY timestamp DESC"
        ).fetchall()
    conn.close()
    return [_parse_match_row(r) for r in rows]


def get_archived_matches(db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM matches WHERE archived = 1 ORDER BY timestamp DESC"
    ).fetchall()
    conn.close()
    return [_parse_match_row(r) for r in rows]


def archive_match(match_id: int, db_path: str = DB_PATH):
    """Mark a match as archived."""
    conn = get_connection(db_path)
    conn.execute("UPDATE matches SET archived = 1 WHERE id = ?", (match_id,))
    conn.commit()
    conn.close()


def restore_match(match_id: int, db_path: str = DB_PATH):
    """Restore an archived match."""
    conn = get_connection(db_path)
    conn.execute("UPDATE matches SET archived = 0 WHERE id = ?", (match_id,))
    conn.commit()
    conn.close()


def delete_elo_history_for_match(match_id: int, db_path: str = DB_PATH):
    """Remove elo_history entries for a match (used when archiving)."""
    conn = get_connection(db_path)
    conn.execute("DELETE FROM elo_history WHERE match_id = ?", (match_id,))
    conn.commit()
    conn.close()


def get_elo_history_for_match(match_id: int, db_path: str = DB_PATH) -> list[dict]:
    """Get elo_history entries for a specific match."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM elo_history WHERE match_id = ?", (match_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def reverse_player_stats(player_id: int, won: bool, is_mvp: bool = False,
                         is_ace: bool = False, db_path: str = DB_PATH):
    """Reverse the stats added by update_player_stats (for match archival)."""
    conn = get_connection(db_path)
    conn.execute("""
        UPDATE players SET
            games_played = MAX(games_played - 1, 0),
            wins = MAX(wins - CASE WHEN ? THEN 1 ELSE 0 END, 0),
            losses = MAX(losses - CASE WHEN ? THEN 0 ELSE 1 END, 0),
            mvp_count = MAX(mvp_count - CASE WHEN ? THEN 1 ELSE 0 END, 0),
            ace_count = MAX(ace_count - CASE WHEN ? THEN 1 ELSE 0 END, 0)
        WHERE id = ?
    """, (won, won, is_mvp, is_ace, player_id))
    conn.commit()
    conn.close()


def reverse_champion_stat(player_id: int, champion: str, won: bool,
                          db_path: str = DB_PATH):
    """Reverse a champion stat entry (for match archival)."""
    conn = get_connection(db_path)
    conn.execute("""
        UPDATE champion_stats SET
            wins = MAX(wins - CASE WHEN ? THEN 1 ELSE 0 END, 0),
            losses = MAX(losses - CASE WHEN ? THEN 0 ELSE 1 END, 0),
            picks = MAX(picks - 1, 0)
        WHERE player_id = ? AND champion = ?
    """, (won, won, player_id, champion))
    conn.commit()
    conn.close()


def get_player_elo_history(player_id: int, db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM elo_history WHERE player_id = ? ORDER BY timestamp ASC",
        (player_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Match Performances ──────────────────────────────────────────────────────

def save_match_performance(match_id: int, player_id: int, champion: str,
                           kills: int, deaths: int, assists: int,
                           damage: int, vision: int, cs: int, gold: int,
                           kp: float, perf_score: float,
                           db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("""
        INSERT INTO match_performances
        (match_id, player_id, champion, kills, deaths, assists,
         total_damage_to_champions, vision_score, cs, gold_earned,
         kill_participation, performance_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id, player_id) DO UPDATE SET
            champion = excluded.champion,
            kills = excluded.kills,
            deaths = excluded.deaths,
            assists = excluded.assists,
            total_damage_to_champions = excluded.total_damage_to_champions,
            vision_score = excluded.vision_score,
            cs = excluded.cs,
            gold_earned = excluded.gold_earned,
            kill_participation = excluded.kill_participation,
            performance_score = excluded.performance_score
    """, (match_id, player_id, champion, kills, deaths, assists,
          damage, vision, cs, gold, kp, perf_score))
    conn.commit()
    conn.close()


def get_match_performances(match_id: int, db_path: str = DB_PATH) -> list[dict]:
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM match_performances WHERE match_id = ? ORDER BY performance_score DESC",
        (match_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Tournament Codes ────────────────────────────────────────────────────────

def save_tournament_code(code: str, match_id: Optional[int] = None,
                         tournament_id: Optional[int] = None,
                         metadata: Optional[dict] = None,
                         db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("""
        INSERT INTO tournament_codes (code, match_id, tournament_id, metadata)
        VALUES (?, ?, ?, ?)
    """, (code, match_id, tournament_id, json.dumps(metadata or {})))
    conn.commit()
    conn.close()


def get_tournament_code(code: str, db_path: str = DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM tournament_codes WHERE code = ?", (code,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["metadata"] = json.loads(d["metadata"])
    return d


def update_tournament_code_status(code: str, status: str, riot_match_id: Optional[str] = None,
                                  db_path: str = DB_PATH):
    conn = get_connection(db_path)
    if riot_match_id:
        conn.execute("UPDATE tournament_codes SET status = ?, riot_match_id = ? WHERE code = ?",
                     (status, riot_match_id, code))
    else:
        conn.execute("UPDATE tournament_codes SET status = ? WHERE code = ?", (status, code))
    conn.commit()
    conn.close()


# ── Riot Config ─────────────────────────────────────────────────────────────

def get_riot_config(db_path: str = DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM riot_config WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else None


def save_riot_config(provider_id: int, tournament_id: int, callback_url: str,
                     region: str = "EUW", use_stub: bool = True,
                     db_path: str = DB_PATH):
    conn = get_connection(db_path)
    conn.execute("""
        INSERT INTO riot_config (id, provider_id, tournament_id, callback_url, region, use_stub)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            tournament_id = excluded.tournament_id,
            callback_url = excluded.callback_url,
            region = excluded.region,
            use_stub = excluded.use_stub,
            updated_at = datetime('now')
    """, (provider_id, tournament_id, callback_url, region, int(use_stub)))
    conn.commit()
    conn.close()


# ── Elo Recalculation Helpers ──────────────────────────────────────────────

def get_player_starting_elos(db_path: str = DB_PATH) -> dict[int, float]:
    """
    Get the starting Elo for each player before any matches.
    Uses the elo_before from their earliest elo_history entry.
    For players with no history, uses their current tournament_elo.
    """
    conn = get_connection(db_path)
    # Get earliest elo_before for each player from elo_history
    rows = conn.execute("""
        SELECT eh.player_id, eh.elo_before
        FROM elo_history eh
        INNER JOIN (
            SELECT player_id, MIN(timestamp) as min_ts
            FROM elo_history
            GROUP BY player_id
        ) first ON eh.player_id = first.player_id AND eh.timestamp = first.min_ts
    """).fetchall()
    starting = {row["player_id"]: row["elo_before"] for row in rows}

    # For players without any elo_history, use their current tournament_elo
    all_players = conn.execute("SELECT id, tournament_elo FROM players").fetchall()
    for p in all_players:
        if p["id"] not in starting:
            starting[p["id"]] = p["tournament_elo"]

    conn.close()
    return starting


def reset_all_for_recalc(starting_elos: dict[int, float], db_path: str = DB_PATH):
    """
    Reset all player stats, champion stats, and elo_history for full recalculation.
    Sets each player's tournament_elo back to their starting value.
    """
    conn = get_connection(db_path)

    # Reset player stats
    conn.execute("""
        UPDATE players SET
            games_played = 0, wins = 0, losses = 0,
            mvp_count = 0, ace_count = 0, last_played = NULL
    """)

    # Reset each player's Elo to their starting value
    for pid, elo in starting_elos.items():
        conn.execute("UPDATE players SET tournament_elo = ? WHERE id = ?", (elo, pid))

    # Clear all elo_history
    conn.execute("DELETE FROM elo_history")

    # Clear all champion_stats
    conn.execute("DELETE FROM champion_stats")

    # Clear elo_changes in all matches (will be repopulated)
    conn.execute("UPDATE matches SET elo_changes = '{}' WHERE archived = 0")

    conn.commit()
    conn.close()


def get_all_matches_chronological(db_path: str = DB_PATH) -> list[dict]:
    """Get all non-archived completed matches ordered by timestamp ASC (oldest first)."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM matches WHERE archived = 0 AND status = 'completed' ORDER BY timestamp ASC"
    ).fetchall()
    conn.close()
    return [_parse_match_row(r) for r in rows]


def update_match_elo_changes(match_id: int, elo_changes: dict, db_path: str = DB_PATH):
    """Update the stored elo_changes for a match."""
    conn = get_connection(db_path)
    conn.execute(
        "UPDATE matches SET elo_changes = ? WHERE id = ?",
        (json.dumps(elo_changes), match_id),
    )
    conn.commit()
    conn.close()


# ── 1v1 Duel System ───────────────────────────────────────────────────────

def get_duel_rating(player_id: int, db_path: str = DB_PATH) -> dict:
    """Get or create a duel rating for a player."""
    conn = get_connection(db_path)
    row = conn.execute("SELECT * FROM duel_ratings WHERE player_id = ?", (player_id,)).fetchone()
    if not row:
        conn.execute("INSERT INTO duel_ratings (player_id) VALUES (?)", (player_id,))
        conn.commit()
        row = conn.execute("SELECT * FROM duel_ratings WHERE player_id = ?", (player_id,)).fetchone()
    conn.close()
    return dict(row)


def get_all_duel_ratings(db_path: str = DB_PATH) -> list[dict]:
    """Get all duel ratings ordered by Elo descending."""
    conn = get_connection(db_path)
    rows = conn.execute("""
        SELECT dr.*, p.name, p.lol_name_tag
        FROM duel_ratings dr
        JOIN players p ON p.id = dr.player_id
        WHERE dr.games > 0
        ORDER BY dr.elo DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_duel_match(player1_id: int, player2_id: int,
                    champion1: str, champion2: str,
                    ban1: str, ban2: str,
                    winner_id: int, win_condition: str,
                    elo_before_1: float, elo_after_1: float,
                    elo_before_2: float, elo_after_2: float,
                    timestamp: Optional[str] = None,
                    db_path: str = DB_PATH) -> int:
    conn = get_connection(db_path)
    ts = timestamp or datetime.now().isoformat()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO duel_matches
        (timestamp, player1_id, player2_id, champion1, champion2,
         ban1, ban2, winner_id, win_condition,
         elo_before_1, elo_after_1, elo_before_2, elo_after_2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (ts, player1_id, player2_id, champion1, champion2,
          ban1, ban2, winner_id, win_condition,
          elo_before_1, elo_after_1, elo_before_2, elo_after_2))
    mid = cur.lastrowid
    conn.commit()
    conn.close()
    return mid


def update_duel_rating(player_id: int, new_elo: float, won: bool,
                       db_path: str = DB_PATH):
    """Update duel rating after a match."""
    conn = get_connection(db_path)
    # Ensure row exists
    row = conn.execute("SELECT * FROM duel_ratings WHERE player_id = ?", (player_id,)).fetchone()
    if not row:
        conn.execute("INSERT INTO duel_ratings (player_id) VALUES (?)", (player_id,))

    if won:
        conn.execute("""
            UPDATE duel_ratings SET
                elo = ?, games = games + 1, wins = wins + 1,
                win_streak = win_streak + 1,
                best_streak = MAX(best_streak, win_streak + 1)
            WHERE player_id = ?
        """, (new_elo, player_id))
    else:
        conn.execute("""
            UPDATE duel_ratings SET
                elo = ?, games = games + 1, losses = losses + 1,
                win_streak = 0
            WHERE player_id = ?
        """, (new_elo, player_id))

    conn.commit()
    conn.close()


def get_all_duel_matches(db_path: str = DB_PATH) -> list[dict]:
    """Get all 1v1 matches ordered by timestamp DESC."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM duel_matches ORDER BY timestamp DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_duel_head_to_head(pid1: int, pid2: int, db_path: str = DB_PATH) -> dict:
    """Get head-to-head stats for two players in 1v1."""
    conn = get_connection(db_path)
    rows = conn.execute("""
        SELECT * FROM duel_matches
        WHERE (player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)
        ORDER BY timestamp DESC
    """, (pid1, pid2, pid2, pid1)).fetchall()
    conn.close()

    matches = [dict(r) for r in rows]
    p1_wins = sum(1 for m in matches if m["winner_id"] == pid1)
    p2_wins = sum(1 for m in matches if m["winner_id"] == pid2)
    return {"matches": matches, "p1_wins": p1_wins, "p2_wins": p2_wins, "total": len(matches)}
