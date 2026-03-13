"""
FastAPI backend for LoL Tournament Manager – v2.
Run with:  python3 -m uvicorn api:app --reload --port 8000

New in v2:
  - Riot tournament-v5 / tournament-stub-v5 integration
  - match-v5 auto-stats (callback → fetch → Elo)
  - Data Dragon champion catalog
  - Performance-weighted Elo with activity bonus
  - Power ranking = Elo + activity adjustment
"""

from __future__ import annotations
import os
import json
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

import database as db
from elo import EloCalculator, PlayerPerformance
from balancer import MatchBalancer
from riot_api import (
    tier_to_elo, fetch_player_rank, parse_name_tag,
    TIER_MAP, DIVISION_MAP, POPULAR_CHAMPIONS,
)
import riot_tournament as riot
from riot_key import get_api_key, set_api_key, has_api_key

from seed import seed_players

log = logging.getLogger(__name__)

# ── Init ─────────────────────────────────────────────────────────────────────
db.init_db()
seed_players()

app = FastAPI(title="LoL Tournament Manager API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

elo_calc = EloCalculator()
balancer = MatchBalancer()

# Try latest build dir first, fall back to older ones
_base = os.path.dirname(os.path.abspath(__file__))
_candidates = ["static9", "static8", "static7", "static6", "static5", "static4", "static3", "static2", "static"]
STATIC_DIR = next(
    (os.path.join(_base, d) for d in _candidates if os.path.isdir(os.path.join(_base, d))),
    os.path.join(_base, "static"),
)


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class AddPlayerRequest(BaseModel):
    name: str
    lol_name_tag: str
    tier: Optional[str] = None
    division: Optional[str] = None
    use_api: bool = False
    use_avg_elo: bool = False


class GenerateTeamsRequest(BaseModel):
    player_ids: list[int]


class CreateMatchRequest(BaseModel):
    team_blue: list[int]
    team_red: list[int]
    picks_blue: list[str] = ["", "", "", "", ""]
    picks_red: list[str] = ["", "", "", "", ""]
    bans_blue: list[str] = ["", "", "", "", ""]
    bans_red: list[str] = ["", "", "", "", ""]
    winner: str  # "Blue" | "Red"
    mvp_player_id: Optional[int] = None
    ace_player_id: Optional[int] = None
    timestamp: Optional[str] = None


class RiotLookupRequest(BaseModel):
    lol_name_tag: str


class SetupTournamentRequest(BaseModel):
    callback_url: str
    region: str = "EUW"
    use_stub: bool = True
    tournament_name: str = "Internal League"


class GenerateCodeRequest(BaseModel):
    match_id: Optional[int] = None
    metadata: str = ""
    pick_type: str = "TOURNAMENT_DRAFT"
    spectator_type: str = "ALL"


class CreateDuelRequest(BaseModel):
    player1_id: int
    player2_id: int
    champion1: str = ""
    champion2: str = ""
    ban1: str = ""
    ban2: str = ""
    winner_id: int
    win_condition: str = "first_kill"  # first_kill | first_tower | cs_100
    timestamp: Optional[str] = None


class SetApiKeyRequest(BaseModel):
    api_key: str


# ── Riot API Key ─────────────────────────────────────────────────────────────

@app.get("/api/riot/key-status")
def riot_key_status():
    """Check if a Riot API key is configured (never returns the actual key)."""
    key = get_api_key()
    if not key:
        return {"has_key": False, "masked": ""}
    masked = key[:8] + "..." + key[-4:] if len(key) > 12 else "****"
    return {"has_key": True, "masked": masked}


@app.post("/api/riot/key")
def update_riot_key(req: SetApiKeyRequest):
    """Set or update the Riot API key at runtime (no restart needed)."""
    if not req.api_key or not req.api_key.strip():
        raise HTTPException(400, "API key cannot be empty")
    set_api_key(req.api_key)
    key = get_api_key()
    masked = key[:8] + "..." + key[-4:] if len(key) > 12 else "****"
    return {"message": "API key updated", "masked": masked}


@app.post("/api/riot/test-key")
def test_riot_key():
    """
    Test the current API key against Riot's API.
    Tries a lightweight endpoint (account-v1 status) to verify auth works.
    Also tests tournament-stub-v5 access specifically.
    """
    import httpx

    key = get_api_key()
    if not key:
        return {"valid": False, "error": "No API key configured"}

    headers = {"X-Riot-Token": key}
    results = {"key_set": True, "masked": key[:8] + "..." + key[-4:] if len(key) > 12 else "****"}

    # Test 1: Basic API access (lightweight - platform status)
    try:
        r = httpx.get(
            "https://euw1.api.riotgames.com/lol/status/v4/platform-data",
            headers=headers, timeout=10,
        )
        results["platform_status"] = r.status_code
        results["platform_ok"] = r.status_code == 200
        if r.status_code == 401:
            results["valid"] = False
            results["error"] = "401 Unauthorized - key is invalid or expired. Regenerate at developer.riotgames.com"
            return results
        if r.status_code == 403:
            results["valid"] = False
            results["error"] = "403 Forbidden - key doesn't have access to this endpoint"
            return results
    except Exception as e:
        results["platform_status"] = "error"
        results["platform_ok"] = False
        results["error"] = "Connection failed: " + str(e).encode("ascii", "replace").decode("ascii")
        results["valid"] = False
        return results

    # Test 2: Tournament-stub-v5 access (POST providers with dummy data to check auth)
    # We use a GET to a non-existent resource - if we get 401 it's auth, 404/405 means auth is fine
    try:
        r2 = httpx.get(
            "https://americas.api.riotgames.com/lol/tournament-stub-v5/providers",
            headers=headers, timeout=10,
        )
        results["tournament_stub_status"] = r2.status_code
        # 405 Method Not Allowed = auth works, just wrong HTTP method (GET vs POST) → good
        # 401 = bad key
        # 403 = key doesn't have tournament access
        if r2.status_code == 405:
            results["tournament_stub_ok"] = True
        elif r2.status_code == 401:
            results["tournament_stub_ok"] = False
            results["error"] = "Key works for basic API but NOT for tournament-stub-v5. You may need a different key type."
        elif r2.status_code == 403:
            results["tournament_stub_ok"] = False
            results["error"] = "403 on tournament-stub - your key type may not have tournament access."
        else:
            results["tournament_stub_ok"] = r2.status_code < 400
    except Exception as e:
        results["tournament_stub_status"] = "error"
        results["tournament_stub_ok"] = False

    results["valid"] = results.get("platform_ok", False)
    return results


# ── Players ──────────────────────────────────────────────────────────────────

@app.get("/api/players")
def list_players(active_only: bool = True):
    players = db.get_all_players(active_only=active_only)
    # Enrich with activity bonus for power ranking
    for p in players:
        activity = elo_calc.compute_activity_bonus(p.get("last_played"))
        p["activity_bonus"] = activity
        p["power_ranking"] = round(p["tournament_elo"] + activity, 2)
    return players


@app.get("/api/players/{player_id}")
def get_player(player_id: int):
    p = db.get_player(player_id)
    if not p:
        raise HTTPException(404, "Player not found")
    activity = elo_calc.compute_activity_bonus(p.get("last_played"))
    p["activity_bonus"] = activity
    p["power_ranking"] = round(p["tournament_elo"] + activity, 2)
    return p


@app.post("/api/players")
def add_player(req: AddPlayerRequest):
    api_elo = 1200.0
    riot_data = None
    puuid = None

    if req.use_api:
        riot_data = fetch_player_rank(req.lol_name_tag)
        if riot_data:
            api_elo = riot_data["elo"]
            # Also try to get PUUID
            try:
                gn, tl = parse_name_tag(req.lol_name_tag)
                from riot_api import _get_region_for_tag
                acct_region, _ = _get_region_for_tag(tl)
                puuid = riot.get_puuid_by_riot_id(gn, tl, acct_region)
            except Exception:
                pass
        else:
            if req.tier:
                api_elo = tier_to_elo(req.tier, req.division or "IV")
    elif req.tier:
        api_elo = tier_to_elo(req.tier, req.division or "IV")

    t_elo = db.get_average_tournament_elo() if req.use_avg_elo else api_elo

    try:
        pid = db.add_player(req.name, req.lol_name_tag, api_elo,
                            tournament_elo=t_elo, puuid=puuid)
    except Exception as e:
        raise HTTPException(400, str(e))

    player = db.get_player(pid)
    return {
        "player": player,
        "riot_data": riot_data,
        "message": f"Player {req.name} added successfully",
    }


@app.post("/api/players/lookup")
def riot_lookup(req: RiotLookupRequest):
    try:
        parse_name_tag(req.lol_name_tag)
    except ValueError:
        raise HTTPException(400, "Invalid format. Use Name#Tag")

    rank = fetch_player_rank(req.lol_name_tag)
    if rank:
        return {"found": True, "rank": rank}
    return {"found": False, "rank": None,
            "message": "Could not reach Riot API or player not found. You can still add manually."}


@app.patch("/api/players/{player_id}/archive")
def archive_player(player_id: int):
    p = db.get_player(player_id)
    if not p:
        raise HTTPException(404, "Player not found")
    db.archive_player(player_id)
    return {"message": f"{p['name']} archived"}


@app.patch("/api/players/{player_id}/reactivate")
def reactivate_player(player_id: int):
    p = db.get_player(player_id)
    if not p:
        raise HTTPException(404, "Player not found")
    db.reactivate_player(player_id)
    return {"message": f"{p['name']} reactivated"}


@app.get("/api/players/{player_id}/stats")
def player_stats(player_id: int):
    p = db.get_player(player_id)
    if not p:
        raise HTTPException(404, "Player not found")
    champ_stats = db.get_player_champion_stats(player_id)
    elo_history = db.get_player_elo_history(player_id)
    activity = elo_calc.compute_activity_bonus(p.get("last_played"))
    return {
        "player": p,
        "champion_stats": champ_stats,
        "elo_history": elo_history,
        "activity_bonus": activity,
        "power_ranking": round(p["tournament_elo"] + activity, 2),
    }


@app.get("/api/players/{player_id}/elo-history")
def player_elo_history(player_id: int):
    return db.get_player_elo_history(player_id)


# ── Matchmaking ──────────────────────────────────────────────────────────────

@app.post("/api/matchmaking/generate")
def generate_teams(req: GenerateTeamsRequest):
    if len(req.player_ids) != 10:
        raise HTTPException(400, "Exactly 10 player IDs required")

    players = []
    for pid in req.player_ids:
        p = db.get_player(pid)
        if not p:
            raise HTTPException(404, f"Player {pid} not found")
        players.append(p)

    splits = balancer.all_splits_sorted(players, top_n=3)
    results = []
    for s in splits:
        results.append({
            "team_blue": s.team_blue,
            "team_red": s.team_red,
            "avg_blue_elo": s.avg_blue_elo,
            "avg_red_elo": s.avg_red_elo,
            "elo_diff": s.elo_diff,
        })
    return results


# ── Matches ──────────────────────────────────────────────────────────────────

@app.get("/api/matches")
def list_matches():
    matches = db.get_all_matches()
    for m in matches:
        m["performances"] = db.get_match_performances(m["id"])
    return matches


@app.get("/api/matches/archived")
def list_archived_matches():
    """List all archived matches."""
    matches = db.get_archived_matches()
    for m in matches:
        m["performances"] = db.get_match_performances(m["id"])
    return matches


@app.get("/api/matches/{match_id}")
def get_match(match_id: int):
    m = db.get_match(match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    m["performances"] = db.get_match_performances(match_id)
    return m


@app.post("/api/matches")
def create_match(req: CreateMatchRequest):
    """Create and resolve a match (manual flow, no tournament code)."""
    if req.winner not in ("Blue", "Red"):
        raise HTTPException(400, "Winner must be 'Blue' or 'Red'")

    blue_players = [db.get_player(pid) for pid in req.team_blue]
    red_players = [db.get_player(pid) for pid in req.team_red]

    if any(p is None for p in blue_players + red_players):
        raise HTTPException(404, "One or more players not found")

    avg_b = sum(p["tournament_elo"] for p in blue_players) / 5
    avg_r = sum(p["tournament_elo"] for p in red_players) / 5

    # Resolve with new Elo v2 (no performances in manual mode)
    results = elo_calc.resolve_match(
        blue_players, red_players, req.winner,
        mvp_id=req.mvp_player_id, ace_id=req.ace_player_id,
    )

    elo_changes = {}
    for r in results:
        elo_changes[str(r.player_id)] = {
            "delta": r.delta,
            "delta_base": r.delta_base,
            "performance_mod": r.performance_mod,
            "activity_bonus": r.activity_bonus,
            "award_bonus": r.award_bonus,
            "performance_score": r.performance_score,
        }

    match_id = db.save_match(
        req.team_blue, req.team_red, avg_b, avg_r,
        req.picks_blue, req.picks_red,
        req.bans_blue, req.bans_red,
        req.winner, req.mvp_player_id, req.ace_player_id,
        elo_changes, timestamp=req.timestamp,
    )

    winning_ids = req.team_blue if req.winner == "Blue" else req.team_red
    for r in results:
        db.update_player_elo(r.player_id, r.elo_after)
        db.update_player_stats(
            r.player_id,
            won=(r.player_id in winning_ids),
            is_mvp=r.is_mvp,
            is_ace=r.is_ace,
        )
        db.save_elo_snapshot(r.player_id, match_id, r.elo_before, r.elo_after)

    all_picks = list(zip(req.team_blue, req.picks_blue)) + list(zip(req.team_red, req.picks_red))
    for pid, champ in all_picks:
        if champ:
            db.update_champion_stat(pid, champ, won=(pid in winning_ids), picked=True)

    elo_details = []
    for r in results:
        p = db.get_player(r.player_id)
        elo_details.append({
            "player_id": r.player_id,
            "name": p["name"] if p else "Unknown",
            "elo_before": r.elo_before,
            "elo_after": r.elo_after,
            "delta": r.delta,
            "delta_base": r.delta_base,
            "performance_mod": r.performance_mod,
            "activity_bonus": r.activity_bonus,
            "award_bonus": r.award_bonus,
            "performance_score": r.performance_score,
            "is_mvp": r.is_mvp,
            "is_ace": r.is_ace,
        })

    return {
        "match_id": match_id,
        "elo_changes": elo_details,
    }


# ── Historical Match (add past match + full Elo recalc) ────────────────────

@app.post("/api/matches/historical")
def create_historical_match(req: CreateMatchRequest):
    """
    Create a match with a past date and fully recalculate ALL Elo chronologically.
    This ensures the inserted match affects all subsequent Elo calculations correctly.
    """
    if req.winner not in ("Blue", "Red"):
        raise HTTPException(400, "Winner must be 'Blue' or 'Red'")
    if not req.timestamp:
        raise HTTPException(400, "timestamp is required for historical matches")

    # Validate all players exist
    for pid in req.team_blue + req.team_red:
        if not db.get_player(pid):
            raise HTTPException(404, f"Player {pid} not found")

    # 1) Capture starting Elos BEFORE we insert anything
    starting_elos = db.get_player_starting_elos()

    # 2) Insert the match record (with empty elo_changes - will be filled during recalc)
    blue_players = [db.get_player(pid) for pid in req.team_blue]
    red_players = [db.get_player(pid) for pid in req.team_red]
    avg_b = sum(p["tournament_elo"] for p in blue_players) / 5
    avg_r = sum(p["tournament_elo"] for p in red_players) / 5

    match_id = db.save_match(
        req.team_blue, req.team_red, avg_b, avg_r,
        req.picks_blue, req.picks_red,
        req.bans_blue, req.bans_red,
        req.winner, req.mvp_player_id, req.ace_player_id,
        {}, timestamp=req.timestamp,
    )

    # 3) Full recalculation
    _recalculate_all_elo(starting_elos)

    return {"match_id": match_id, "message": "Historical match added. Full Elo recalculation complete."}


def _recalculate_all_elo(starting_elos: dict[int, float]):
    """
    Reset all stats and replay every non-archived match chronologically.
    This ensures Elo is consistent when matches are inserted out of order.
    """
    # 1) Reset everything to starting state
    db.reset_all_for_recalc(starting_elos)

    # 2) Get all matches in chronological order
    matches = db.get_all_matches_chronological()

    # 3) Replay each match
    for m in matches:
        mid = m["id"]
        winner = m["winner"]
        if not winner:
            continue

        winning_ids = set(m["team_blue"] if winner == "Blue" else m["team_red"])

        # Get current player state (Elo has been accumulating match by match)
        blue_players = [db.get_player(pid) for pid in m["team_blue"]]
        red_players = [db.get_player(pid) for pid in m["team_red"]]

        if any(p is None for p in blue_players + red_players):
            continue

        # Recalculate Elo
        results = elo_calc.resolve_match(
            blue_players, red_players, winner,
            mvp_id=m.get("mvp_player_id"), ace_id=m.get("ace_player_id"),
        )

        # Build elo_changes
        elo_changes = {}
        for r in results:
            elo_changes[str(r.player_id)] = {
                "delta": r.delta,
                "delta_base": r.delta_base,
                "performance_mod": r.performance_mod,
                "activity_bonus": r.activity_bonus,
                "award_bonus": r.award_bonus,
                "performance_score": r.performance_score,
            }

        # Update match elo_changes
        db.update_match_elo_changes(mid, elo_changes)

        # Update avg elo (current state)
        avg_b = sum(p["tournament_elo"] for p in blue_players) / 5
        avg_r = sum(p["tournament_elo"] for p in red_players) / 5
        conn = db.get_connection()
        conn.execute(
            "UPDATE matches SET avg_blue_elo = ?, avg_red_elo = ? WHERE id = ?",
            (avg_b, avg_r, mid),
        )
        conn.commit()
        conn.close()

        # Apply Elo and stats
        match_ts = m.get("timestamp")
        for r in results:
            db.update_player_elo(r.player_id, r.elo_after)
            db.update_player_stats(
                r.player_id,
                won=(r.player_id in winning_ids),
                is_mvp=r.is_mvp,
                is_ace=r.is_ace,
                timestamp=match_ts,
            )
            db.save_elo_snapshot(r.player_id, mid, r.elo_before, r.elo_after)

        # Champion stats
        all_picks = list(zip(m["team_blue"], m["picks_blue"])) + list(zip(m["team_red"], m["picks_red"]))
        for pid, champ in all_picks:
            if champ:
                db.update_champion_stat(pid, champ, won=(pid in winning_ids), picked=True)


# ── Match Archive / Restore ────────────────────────────────────────────────

@app.patch("/api/matches/{match_id}/archive")
def archive_match(match_id: int):
    """
    Archive a match: reverse all Elo changes, player stats, and champion stats.
    The match is kept in the DB with archived=1 so it can be restored later.
    """
    m = db.get_match(match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.get("archived"):
        raise HTTPException(400, "Match is already archived")
    if m.get("status") != "completed":
        raise HTTPException(400, "Can only archive completed matches")

    winner = m["winner"]
    winning_ids = set(m["team_blue"] if winner == "Blue" else m["team_red"])
    all_player_ids = m["team_blue"] + m["team_red"]

    # 1) Reverse Elo: read elo_history for this match, revert each player
    elo_entries = db.get_elo_history_for_match(match_id)
    for entry in elo_entries:
        # Set Elo back to what it was before this match
        db.update_player_elo(entry["player_id"], entry["elo_before"])

    # 2) Reverse player stats (games, wins, losses, mvp, ace)
    for pid in all_player_ids:
        won = pid in winning_ids
        is_mvp = pid == m.get("mvp_player_id")
        is_ace = pid == m.get("ace_player_id")
        db.reverse_player_stats(pid, won, is_mvp, is_ace)

    # 3) Reverse champion stats
    for pid, champ in zip(m["team_blue"], m["picks_blue"]):
        if champ:
            db.reverse_champion_stat(pid, champ, won=(pid in winning_ids))
    for pid, champ in zip(m["team_red"], m["picks_red"]):
        if champ:
            db.reverse_champion_stat(pid, champ, won=(pid in winning_ids))

    # 4) Remove elo_history entries for this match
    db.delete_elo_history_for_match(match_id)

    # 5) Mark match as archived
    db.archive_match(match_id)

    return {"message": f"Match #{match_id} archived. Elo changes reversed for {len(elo_entries)} players."}


@app.patch("/api/matches/{match_id}/restore")
def restore_match(match_id: int):
    """
    Restore an archived match: re-apply Elo changes, player stats, and champion stats.
    """
    m = db.get_match(match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if not m.get("archived"):
        raise HTTPException(400, "Match is not archived")

    winner = m["winner"]
    if not winner:
        raise HTTPException(400, "Cannot restore a match without a winner")

    winning_ids = set(m["team_blue"] if winner == "Blue" else m["team_red"])

    blue_players = [db.get_player(pid) for pid in m["team_blue"]]
    red_players = [db.get_player(pid) for pid in m["team_red"]]

    if any(p is None for p in blue_players + red_players):
        raise HTTPException(400, "One or more players no longer exist")

    # Re-run Elo calculation
    results = elo_calc.resolve_match(
        blue_players, red_players, winner,
        mvp_id=m.get("mvp_player_id"), ace_id=m.get("ace_player_id"),
    )

    # Apply results
    elo_changes = {}
    for r in results:
        elo_changes[str(r.player_id)] = {
            "delta": r.delta,
            "delta_base": r.delta_base,
            "performance_mod": r.performance_mod,
            "activity_bonus": r.activity_bonus,
            "award_bonus": r.award_bonus,
            "performance_score": r.performance_score,
        }

    # Update Elo, stats, history
    for r in results:
        db.update_player_elo(r.player_id, r.elo_after)
        db.update_player_stats(
            r.player_id,
            won=(r.player_id in winning_ids),
            is_mvp=r.is_mvp,
            is_ace=r.is_ace,
        )
        db.save_elo_snapshot(r.player_id, match_id, r.elo_before, r.elo_after)

    # Re-apply champion stats
    for pid, champ in zip(m["team_blue"], m["picks_blue"]):
        if champ:
            db.update_champion_stat(pid, champ, won=(pid in winning_ids), picked=True)
    for pid, champ in zip(m["team_red"], m["picks_red"]):
        if champ:
            db.update_champion_stat(pid, champ, won=(pid in winning_ids), picked=True)

    # Update stored elo_changes and un-archive
    conn = db.get_connection()
    import json as _json
    conn.execute(
        "UPDATE matches SET elo_changes = ?, archived = 0 WHERE id = ?",
        (_json.dumps(elo_changes), match_id),
    )
    conn.commit()
    conn.close()

    return {"message": f"Match #{match_id} restored. Elo re-applied for {len(results)} players."}


# ── Tournament Code Flow ────────────────────────────────────────────────────

@app.get("/api/tournament/config")
def get_tournament_config():
    """Get current Riot tournament configuration."""
    config = db.get_riot_config()
    if not config:
        return {"configured": False}
    return {"configured": True, **config}


@app.post("/api/tournament/setup")
def setup_tournament(req: SetupTournamentRequest):
    """
    One-time setup: register provider + create tournament.
    Stores IDs in riot_config table.
    """
    # Sanitize inputs: strip non-ASCII chars that can cause httpx encoding errors
    clean_url = req.callback_url.encode("ascii", "ignore").decode("ascii").strip()
    clean_name = req.tournament_name.encode("ascii", "replace").decode("ascii").strip()
    if not clean_url:
        raise HTTPException(400, "Callback URL contains invalid characters or is empty")
    try:
        provider_id = riot.register_provider(
            clean_url, region=req.region, use_stub=req.use_stub
        )
        tournament_id = riot.create_tournament(
            provider_id, name=clean_name, use_stub=req.use_stub
        )
        db.save_riot_config(
            provider_id, tournament_id, req.callback_url,
            region=req.region, use_stub=req.use_stub,
        )
        return {
            "provider_id": provider_id,
            "tournament_id": tournament_id,
            "message": "Tournament configured successfully",
        }
    except Exception as e:
        # Sanitize error message to ASCII to avoid encoding issues
        err_msg = str(e).encode("ascii", "replace").decode("ascii")
        raise HTTPException(400, f"Setup failed: {err_msg}")


@app.post("/api/tournament/codes")
def generate_code(req: GenerateCodeRequest):
    """
    Generate a tournament code for a match.
    If match_id is given, links the code to that pending match.
    """
    config = db.get_riot_config()
    if not config:
        raise HTTPException(400, "Tournament not configured. Call POST /api/tournament/setup first.")

    try:
        codes = riot.generate_tournament_codes(
            config["tournament_id"],
            count=1,
            pick_type=req.pick_type,
            spectator_type=req.spectator_type,
            metadata=req.metadata,
            use_stub=bool(config["use_stub"]),
        )
        code = codes[0]

        # Save to DB
        db.save_tournament_code(
            code, match_id=req.match_id,
            tournament_id=config["tournament_id"],
            metadata={"pick_type": req.pick_type},
        )

        # Link to match if provided
        if req.match_id:
            m = db.get_match(req.match_id)
            if m:
                conn = db.get_connection()
                conn.execute("UPDATE matches SET tournament_code = ? WHERE id = ?",
                             (code, req.match_id))
                conn.commit()
                conn.close()

        return {"code": code, "match_id": req.match_id}
    except Exception as e:
        raise HTTPException(400, f"Code generation failed: {e}")


@app.post("/api/tournament/callback")
async def tournament_callback(request: Request):
    """
    Riot POSTs here when a tournament-code game finishes.
    Stub sends minimal JSON; production sends full callback.

    Flow: receive callback → fetch match-v5 → extract performances → calculate Elo → save.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    log.info(f"Tournament callback received: {json.dumps(body)[:500]}")

    # The callback typically contains:
    # { "startTime", "shortCode", "metaData", "gameId", "winningTeam",
    #   "gameName", "gameType", "gameMap", "gameMode" }
    short_code = body.get("shortCode", "")
    game_id = body.get("gameId")
    winning_team_id = body.get("winningTeam", [])  # list of summoner IDs

    if not short_code:
        return {"status": "ok", "message": "No shortCode, ignoring"}

    # Find our match by tournament code
    tc = db.get_tournament_code(short_code)
    match = db.get_match_by_tournament_code(short_code) if not tc else None
    if tc and tc.get("match_id"):
        match = db.get_match(tc["match_id"])

    # Update tournament code status
    db.update_tournament_code_status(short_code, "used",
                                     riot_match_id=str(game_id) if game_id else None)

    # Try to auto-resolve via match-v5
    if game_id:
        config = db.get_riot_config()
        platform = riot.REGION_DISPLAY.get(config["region"], "euw1") if config else "euw1"
        region_prefix = platform.upper().replace("1", "")

        riot_match_id = f"{region_prefix}_{game_id}"
        match_data = riot.get_match_by_id(riot_match_id, platform)

        if match_data and match:
            try:
                _auto_resolve_match(match, match_data, riot_match_id)
            except Exception as e:
                log.error(f"Auto-resolve failed: {e}")

    return {"status": "ok", "message": "Callback processed"}


def _auto_resolve_match(match: dict, match_data: dict, riot_match_id: str):
    """
    Auto-resolve a pending match using match-v5 data.
    Maps PUUIDs to player IDs, extracts performances, computes Elo.
    """
    parsed = riot.parse_match_data(match_data)
    match_id = match["id"]

    # Build PUUID → player_id map
    all_player_ids = match["team_blue"] + match["team_red"]
    puuid_map = {}
    for pid in all_player_ids:
        p = db.get_player(pid)
        if p and p.get("puuid"):
            puuid_map[p["puuid"]] = pid

    # Determine winner
    winning_team = parsed["winning_team"]  # 100=blue, 200=red

    # Check which side won by matching PUUIDs
    blue_puuids = set()
    red_puuids = set()
    for part in parsed["participants"]:
        if part.team_id == 100:
            blue_puuids.add(part.puuid)
        else:
            red_puuids.add(part.puuid)

    # Count how many of our blue_team players are in the game's blue side
    blue_in_100 = sum(1 for pid in match["team_blue"]
                      if any(db.get_player(pid) and db.get_player(pid).get("puuid") == puuid
                             for puuid in blue_puuids))
    blue_in_200 = sum(1 for pid in match["team_blue"]
                      if any(db.get_player(pid) and db.get_player(pid).get("puuid") == puuid
                             for puuid in red_puuids))

    # If our "blue" team is on team_id=200, we need to flip
    if blue_in_200 > blue_in_100:
        winner = "Blue" if winning_team == 200 else "Red"
    else:
        winner = "Blue" if winning_team == 100 else "Red"

    # Build performances
    performances: dict[int, PlayerPerformance] = {}
    picks_blue = [""] * 5
    picks_red = [""] * 5

    for part in parsed["participants"]:
        pid = puuid_map.get(part.puuid)
        if pid is None:
            continue

        perf = PlayerPerformance(
            player_id=pid,
            kills=part.kills,
            deaths=part.deaths,
            assists=part.assists,
            total_damage_to_champions=part.total_damage_to_champions,
            vision_score=part.vision_score,
            cs=part.cs,
            gold_earned=part.gold_earned,
        )
        performances[pid] = perf

        # Assign champion picks
        champ_name = part.champion_name
        if pid in match["team_blue"]:
            idx = match["team_blue"].index(pid)
            picks_blue[idx] = champ_name
        elif pid in match["team_red"]:
            idx = match["team_red"].index(pid)
            picks_red[idx] = champ_name

    # Compute Elo
    blue_players = [db.get_player(pid) for pid in match["team_blue"]]
    red_players = [db.get_player(pid) for pid in match["team_red"]]

    # Auto-pick MVP and ACE based on performance scores
    # MVP = best performer on winning team, ACE = best on losing
    results = elo_calc.resolve_match(
        blue_players, red_players, winner,
        performances=performances,
    )

    # Find best performers for MVP/ACE
    winning_ids = match["team_blue"] if winner == "Blue" else match["team_red"]
    losing_ids = match["team_red"] if winner == "Blue" else match["team_blue"]

    mvp_id = None
    ace_id = None
    best_winner_score = -999
    best_loser_score = -999

    for r in results:
        if r.player_id in winning_ids and r.performance_score > best_winner_score:
            best_winner_score = r.performance_score
            mvp_id = r.player_id
        if r.player_id in losing_ids and r.performance_score > best_loser_score:
            best_loser_score = r.performance_score
            ace_id = r.player_id

    # Re-compute with MVP/ACE bonuses
    results = elo_calc.resolve_match(
        blue_players, red_players, winner,
        mvp_id=mvp_id, ace_id=ace_id,
        performances=performances,
    )

    elo_changes = {}
    for r in results:
        elo_changes[str(r.player_id)] = {
            "delta": r.delta,
            "delta_base": r.delta_base,
            "performance_mod": r.performance_mod,
            "activity_bonus": r.activity_bonus,
            "award_bonus": r.award_bonus,
            "performance_score": r.performance_score,
        }

    # Update match
    db.update_match_result(
        match_id, winner, mvp_id, ace_id, elo_changes,
        picks_blue=picks_blue, picks_red=picks_red,
        riot_match_id=riot_match_id,
        duration_seconds=parsed["game_duration"],
    )

    # Update player stats and Elo
    for r in results:
        db.update_player_elo(r.player_id, r.elo_after)
        db.update_player_stats(
            r.player_id,
            won=(r.player_id in winning_ids),
            is_mvp=r.is_mvp,
            is_ace=r.is_ace,
        )
        db.save_elo_snapshot(r.player_id, match_id, r.elo_before, r.elo_after)

    # Save individual performances
    for pid, perf in performances.items():
        r_data = next((r for r in results if r.player_id == pid), None)
        ps = r_data.performance_score if r_data else 0.0
        champ = ""
        if pid in match["team_blue"]:
            idx = match["team_blue"].index(pid)
            champ = picks_blue[idx]
        elif pid in match["team_red"]:
            idx = match["team_red"].index(pid)
            champ = picks_red[idx]

        # Compute KP
        team_kills = sum(performances[p].kills for p in
                         (match["team_blue"] if pid in match["team_blue"] else match["team_red"])
                         if p in performances)
        kp = (perf.kills + perf.assists) / max(team_kills, 1)

        db.save_match_performance(
            match_id, pid, champ,
            perf.kills, perf.deaths, perf.assists,
            perf.total_damage_to_champions, perf.vision_score,
            perf.cs, perf.gold_earned, kp, ps,
        )

    # Champion stats
    for pid in match["team_blue"]:
        idx = match["team_blue"].index(pid)
        if picks_blue[idx]:
            db.update_champion_stat(pid, picks_blue[idx], won=(pid in winning_ids))
    for pid in match["team_red"]:
        idx = match["team_red"].index(pid)
        if picks_red[idx]:
            db.update_champion_stat(pid, picks_red[idx], won=(pid in winning_ids))

    log.info(f"Auto-resolved match #{match_id}: {winner} wins, MVP={mvp_id}, ACE={ace_id}")


# ── Manual resolve with match-v5 data ────────────────────────────────────────

@app.post("/api/matches/{match_id}/resolve-from-riot")
def resolve_from_riot(match_id: int, riot_match_id: str):
    """
    Manually trigger auto-resolve by providing a Riot match ID.
    Useful when callback didn't fire or for retroactive import.
    """
    match = db.get_match(match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if match["status"] == "completed":
        raise HTTPException(400, "Match already resolved")

    config = db.get_riot_config()
    platform = riot.REGION_DISPLAY.get(config["region"], "euw1") if config else "euw1"

    match_data = riot.get_match_by_id(riot_match_id, platform)
    if not match_data:
        raise HTTPException(400, f"Could not fetch Riot match {riot_match_id}")

    _auto_resolve_match(match, match_data, riot_match_id)
    updated = db.get_match(match_id)
    return {"message": "Match resolved from Riot data", "match": updated}


# ── Champions ────────────────────────────────────────────────────────────────

@app.get("/api/champions/stats")
def champion_stats():
    return db.get_global_champion_stats()


@app.get("/api/champions/list")
def champion_list():
    """Return champion list: Data Dragon if available, else static list."""
    try:
        catalog = riot.get_champion_catalog()
        if catalog:
            return catalog
    except Exception:
        pass
    # Fallback to static list
    return POPULAR_CHAMPIONS


@app.get("/api/champions/catalog")
def champion_catalog():
    """Full Data Dragon catalog with images."""
    catalog = riot.get_champion_catalog()
    if not catalog:
        raise HTTPException(503, "Could not fetch Data Dragon data")
    return catalog


# ── Overview ─────────────────────────────────────────────────────────────────

@app.get("/api/stats/overview")
def stats_overview():
    players = db.get_all_players(active_only=True)
    matches = db.get_all_matches()
    avg_elo = sum(p["tournament_elo"] for p in players) / len(players) if players else 0
    top = max(players, key=lambda p: p["tournament_elo"]) if players else None

    # Power rankings
    for p in players:
        activity = elo_calc.compute_activity_bonus(p.get("last_played"))
        p["power_ranking"] = round(p["tournament_elo"] + activity, 2)

    top_power = max(players, key=lambda p: p["power_ranking"]) if players else None

    return {
        "total_players": len(players),
        "total_matches": len(matches),
        "avg_elo": round(avg_elo, 1),
        "top_player": top,
        "top_power_player": top_power,
    }


@app.get("/api/tiers")
def list_tiers():
    return {"tiers": list(TIER_MAP.keys()), "divisions": list(DIVISION_MAP.keys())}


# ── Versus ───────────────────────────────────────────────────────────────────

@app.get("/api/versus/{player_a_id}/{player_b_id}")
def versus_stats(player_a_id: int, player_b_id: int):
    pa = db.get_player(player_a_id)
    pb = db.get_player(player_b_id)
    if not pa or not pb:
        raise HTTPException(404, "Player not found")

    matches = db.get_all_matches()

    as_teammates = []
    as_opponents = []

    for m in matches:
        a_in_blue = player_a_id in m["team_blue"]
        a_in_red = player_a_id in m["team_red"]
        b_in_blue = player_b_id in m["team_blue"]
        b_in_red = player_b_id in m["team_red"]

        if not (a_in_blue or a_in_red) or not (b_in_blue or b_in_red):
            continue

        same_team = (a_in_blue and b_in_blue) or (a_in_red and b_in_red)
        if same_team:
            as_teammates.append(m)
        else:
            as_opponents.append(m)

    # Synergy
    syn_wins = syn_losses = 0
    syn_elo_combined = []
    syn_champs_a = {}
    syn_champs_b = {}

    for m in as_teammates:
        both_blue = player_a_id in m["team_blue"]
        team_side = "Blue" if both_blue else "Red"
        won = m["winner"] == team_side
        if won:
            syn_wins += 1
        else:
            syn_losses += 1

        ec = m["elo_changes"]
        delta_a = ec.get(str(player_a_id), ec.get(str(player_a_id), {}) if isinstance(ec.get(str(player_a_id)), dict) else 0)
        delta_b = ec.get(str(player_b_id), ec.get(str(player_b_id), {}) if isinstance(ec.get(str(player_b_id)), dict) else 0)
        if isinstance(delta_a, dict):
            delta_a = delta_a.get("delta", 0)
        if isinstance(delta_b, dict):
            delta_b = delta_b.get("delta", 0)
        syn_elo_combined.append({"match_id": m["id"], "delta_a": delta_a, "delta_b": delta_b})

        picks = m["picks_blue"] if both_blue else m["picks_red"]
        team_ids = m["team_blue"] if both_blue else m["team_red"]
        for pid, champ in zip(team_ids, picks):
            if champ:
                if pid == player_a_id:
                    syn_champs_a[champ] = syn_champs_a.get(champ, {"picks": 0, "wins": 0})
                    syn_champs_a[champ]["picks"] += 1
                    if won:
                        syn_champs_a[champ]["wins"] += 1
                elif pid == player_b_id:
                    syn_champs_b[champ] = syn_champs_b.get(champ, {"picks": 0, "wins": 0})
                    syn_champs_b[champ]["picks"] += 1
                    if won:
                        syn_champs_b[champ]["wins"] += 1

    # Rivalry
    rival_a_wins = rival_b_wins = 0
    rival_elo_deltas = []
    rival_champs_a = {}
    rival_champs_b = {}

    for m in as_opponents:
        a_blue = player_a_id in m["team_blue"]
        a_side = "Blue" if a_blue else "Red"
        a_won = m["winner"] == a_side

        if a_won:
            rival_a_wins += 1
        else:
            rival_b_wins += 1

        ec = m["elo_changes"]
        delta_a = ec.get(str(player_a_id), 0)
        delta_b = ec.get(str(player_b_id), 0)
        if isinstance(delta_a, dict):
            delta_a = delta_a.get("delta", 0)
        if isinstance(delta_b, dict):
            delta_b = delta_b.get("delta", 0)
        rival_elo_deltas.append({"match_id": m["id"], "delta_a": delta_a, "delta_b": delta_b, "a_won": a_won})

        a_picks = m["picks_blue"] if a_blue else m["picks_red"]
        a_team = m["team_blue"] if a_blue else m["team_red"]
        b_picks = m["picks_red"] if a_blue else m["picks_blue"]
        b_team = m["team_red"] if a_blue else m["team_blue"]

        for pid, champ in zip(a_team, a_picks):
            if pid == player_a_id and champ:
                rival_champs_a[champ] = rival_champs_a.get(champ, {"picks": 0, "wins": 0})
                rival_champs_a[champ]["picks"] += 1
                if a_won:
                    rival_champs_a[champ]["wins"] += 1
        for pid, champ in zip(b_team, b_picks):
            if pid == player_b_id and champ:
                rival_champs_b[champ] = rival_champs_b.get(champ, {"picks": 0, "wins": 0})
                rival_champs_b[champ]["picks"] += 1
                if not a_won:
                    rival_champs_b[champ]["wins"] += 1

    shared = as_teammates + as_opponents
    mvp_a = sum(1 for m in shared if m["mvp_player_id"] == player_a_id)
    mvp_b = sum(1 for m in shared if m["mvp_player_id"] == player_b_id)
    ace_a = sum(1 for m in shared if m["ace_player_id"] == player_a_id)
    ace_b = sum(1 for m in shared if m["ace_player_id"] == player_b_id)

    def champ_list(d):
        return sorted(
            [{"champion": k, **v} for k, v in d.items()],
            key=lambda x: x["picks"], reverse=True,
        )

    return {
        "player_a": pa,
        "player_b": pb,
        "total_shared_matches": len(shared),
        "synergy": {
            "games": len(as_teammates),
            "wins": syn_wins,
            "losses": syn_losses,
            "win_rate": round(syn_wins / len(as_teammates) * 100, 1) if as_teammates else 0,
            "elo_history": syn_elo_combined,
            "champions_a": champ_list(syn_champs_a),
            "champions_b": champ_list(syn_champs_b),
        },
        "rivalry": {
            "games": len(as_opponents),
            "a_wins": rival_a_wins,
            "b_wins": rival_b_wins,
            "elo_history": rival_elo_deltas,
            "champions_a": champ_list(rival_champs_a),
            "champions_b": champ_list(rival_champs_b),
        },
        "awards": {
            "mvp_a": mvp_a, "mvp_b": mvp_b,
            "ace_a": ace_a, "ace_b": ace_b,
        },
    }


# ── 1v1 Duel System ────────────────────────────────────────────────────────

DUEL_K = 32.0  # K-factor for 1v1 (slightly higher than 5v5 for faster convergence)


def _duel_elo(r1: float, r2: float, winner: int, p1_id: int) -> tuple[float, float]:
    """Simple Elo calculation for 1v1. Returns (new_r1, new_r2)."""
    e1 = 1.0 / (1.0 + 10 ** ((r2 - r1) / 400.0))
    e2 = 1.0 - e1
    s1 = 1.0 if winner == p1_id else 0.0
    s2 = 1.0 - s1
    new_r1 = r1 + DUEL_K * (s1 - e1)
    new_r2 = r2 + DUEL_K * (s2 - e2)
    return round(new_r1, 2), round(new_r2, 2)


@app.get("/api/duels/rankings")
def duel_rankings():
    """Get all 1v1 rankings."""
    ratings = db.get_all_duel_ratings()
    return ratings


@app.get("/api/duels/matches")
def duel_matches():
    """Get all 1v1 match history."""
    matches = db.get_all_duel_matches()
    return matches


@app.post("/api/duels/matches")
def create_duel(req: CreateDuelRequest):
    """Create a 1v1 duel match and update ratings."""
    if req.player1_id == req.player2_id:
        raise HTTPException(400, "Cannot duel yourself")
    if req.winner_id not in (req.player1_id, req.player2_id):
        raise HTTPException(400, "Winner must be one of the two players")
    if req.win_condition not in ("first_kill", "first_tower", "cs_100"):
        raise HTTPException(400, "Invalid win condition")

    p1 = db.get_player(req.player1_id)
    p2 = db.get_player(req.player2_id)
    if not p1 or not p2:
        raise HTTPException(404, "Player not found")

    # Get or create duel ratings
    dr1 = db.get_duel_rating(req.player1_id)
    dr2 = db.get_duel_rating(req.player2_id)

    r1_before = dr1["elo"]
    r2_before = dr2["elo"]

    # Calculate new Elo
    r1_after, r2_after = _duel_elo(r1_before, r2_before, req.winner_id, req.player1_id)

    # Save match
    match_id = db.save_duel_match(
        req.player1_id, req.player2_id,
        req.champion1, req.champion2,
        req.ban1, req.ban2,
        req.winner_id, req.win_condition,
        r1_before, r1_after, r2_before, r2_after,
        timestamp=req.timestamp,
    )

    # Update ratings
    db.update_duel_rating(req.player1_id, r1_after, won=(req.winner_id == req.player1_id))
    db.update_duel_rating(req.player2_id, r2_after, won=(req.winner_id == req.player2_id))

    return {
        "match_id": match_id,
        "player1": {"id": req.player1_id, "name": p1["name"], "elo_before": r1_before, "elo_after": r1_after,
                     "delta": round(r1_after - r1_before, 2)},
        "player2": {"id": req.player2_id, "name": p2["name"], "elo_before": r2_before, "elo_after": r2_after,
                     "delta": round(r2_after - r2_before, 2)},
    }


@app.get("/api/duels/stats")
def duel_overview():
    """Overview stats for the 1v1 tournament."""
    ratings = db.get_all_duel_ratings()
    matches = db.get_all_duel_matches()
    top = ratings[0] if ratings else None
    best_streak_player = max(ratings, key=lambda r: r["best_streak"]) if ratings else None
    return {
        "total_players": len(ratings),
        "total_matches": len(matches),
        "top_player": top,
        "best_streak_player": best_streak_player,
    }


# ── Elo Formula Info ────────────────────────────────────────────────────────

@app.get("/api/elo/formula")
def elo_formula_info():
    """Return info about the current Elo formula for the frontend."""
    return {
        "version": "v2",
        "k_factor": elo_calc.K_FACTOR,
        "clamp": [elo_calc.CLAMP_MIN, elo_calc.CLAMP_MAX],
        "performance_multiplier": elo_calc.PERF_MULTIPLIER,
        "mvp_bonus": elo_calc.MVP_BONUS,
        "ace_bonus": elo_calc.ACE_BONUS,
        "catch_up_threshold": elo_calc.CATCH_UP_THRESHOLD,
        "catch_up_k_mult": elo_calc.CATCH_UP_K_MULT,
        "performance_weights": {
            "kda": 0.35,
            "kill_participation": 0.20,
            "damage_share": 0.20,
            "vision_share": 0.15,
            "cs_gold_share": 0.10,
        },
        "activity_bonus": {
            "14_days": "+2",
            "30_days": "+1",
            "45_days": "0",
            "45_plus": "-2",
        },
        "formula": "finalDelta = clamp(deltaBase + performanceModifier + activityBonus + awardBonus, -28, +28)",
    }


# ── Serve React Frontend ─────────────────────────────────────────────────────

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
