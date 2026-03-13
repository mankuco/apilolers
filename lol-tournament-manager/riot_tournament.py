"""
Riot Games Tournament & Match Integration.

Covers:
  - tournament-stub-v5 (testing) / tournament-v5 (production)
  - match-v5 (auto-fetch match stats after callback)
  - Data Dragon (champion catalog with images)

Set RIOT_API_KEY env var.  By default uses tournament-stub for safety.
"""

from __future__ import annotations
import logging
import httpx
from typing import Optional
from dataclasses import dataclass
from riot_key import get_api_key

log = logging.getLogger(__name__)

# ── Region Routing ──────────────────────────────────────────────────────────

PLATFORM_TO_REGION = {
    "euw1": "europe", "eun1": "europe", "tr1": "europe", "ru": "europe",
    "na1": "americas", "br1": "americas", "la1": "americas", "la2": "americas",
    "kr": "asia", "jp1": "asia",
    "oc1": "sea", "ph2": "sea", "sg2": "sea", "th2": "sea", "tw2": "sea", "vn2": "sea",
}

REGION_DISPLAY = {
    "EUW": "euw1", "EUNE": "eun1", "NA": "na1", "KR": "kr",
    "BR": "br1", "LAN": "la1", "LAS": "la2", "OCE": "oc1",
    "JP": "jp1", "TR": "tr1", "RU": "ru",
}


def _headers():
    return {"X-Riot-Token": get_api_key()}


def _routing_region(platform: str) -> str:
    return PLATFORM_TO_REGION.get(platform, "europe")


# ── Data Dragon ─────────────────────────────────────────────────────────────

_DDRAGON_VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json"
_ddragon_cache: dict = {}


def get_latest_ddragon_version() -> str:
    """Fetch the latest Data Dragon version string."""
    if "version" in _ddragon_cache:
        return _ddragon_cache["version"]
    try:
        r = httpx.get(_DDRAGON_VERSIONS_URL, timeout=10)
        r.raise_for_status()
        versions = r.json()
        ver = versions[0] if versions else "14.24.1"
        _ddragon_cache["version"] = ver
        return ver
    except Exception:
        return "14.24.1"


def get_champion_catalog() -> list[dict]:
    """
    Fetch full champion list from Data Dragon.
    Returns list of {id, key, name, title, image_url}.
    """
    if "champions" in _ddragon_cache:
        return _ddragon_cache["champions"]

    ver = get_latest_ddragon_version()
    url = f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/en_US/champion.json"
    try:
        r = httpx.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()["data"]
        champions = []
        for key, val in data.items():
            champions.append({
                "id": key,
                "key": int(val["key"]),
                "name": val["name"],
                "title": val["title"],
                "image_url": f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/champion/{key}.png",
                "splash_url": f"https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{key}_0.jpg",
            })
        champions.sort(key=lambda c: c["name"])
        _ddragon_cache["champions"] = champions
        return champions
    except Exception as e:
        log.warning(f"Data Dragon fetch failed: {e}")
        return []


def champion_key_to_name(key: int) -> str:
    """Convert a numeric champion key (from match-v5) to champion name."""
    catalog = get_champion_catalog()
    for c in catalog:
        if c["key"] == key:
            return c["name"]
    return f"Champion#{key}"


# ── Tournament API (stub or production) ─────────────────────────────────────

@dataclass
class TournamentConfig:
    provider_id: int
    tournament_id: int
    use_stub: bool = True
    platform: str = "euw1"


def _tournament_base(use_stub: bool) -> str:
    prefix = "tournament-stub-v5" if use_stub else "tournament-v5"
    return f"https://americas.api.riotgames.com/lol/{prefix}"


def register_provider(callback_url: str, region: str = "EUW",
                      use_stub: bool = True) -> int:
    """
    Register a tournament provider.  Returns provider_id.
    Region must be one of: BR, EUNE, EUW, JP, LAN, LAS, NA, OCE, PBE, RU, TR, KR
    """
    base = _tournament_base(use_stub)
    url = f"{base}/providers"
    body = {"region": region.upper(), "url": callback_url}
    r = httpx.post(url, json=body, headers=_headers(), timeout=15)
    r.raise_for_status()
    provider_id = r.json()
    log.info(f"Registered provider: {provider_id}")
    return provider_id


def create_tournament(provider_id: int, name: str = "Internal League",
                      use_stub: bool = True) -> int:
    """Create a tournament.  Returns tournament_id."""
    base = _tournament_base(use_stub)
    url = f"{base}/tournaments"
    body = {"name": name, "providerId": provider_id}
    r = httpx.post(url, json=body, headers=_headers(), timeout=15)
    r.raise_for_status()
    tournament_id = r.json()
    log.info(f"Created tournament: {tournament_id}")
    return tournament_id


def generate_tournament_codes(tournament_id: int, count: int = 1,
                              map_type: str = "SUMMONERS_RIFT",
                              pick_type: str = "TOURNAMENT_DRAFT",
                              team_size: int = 5,
                              spectator_type: str = "ALL",
                              metadata: str = "",
                              use_stub: bool = True) -> list[str]:
    """
    Generate tournament codes for custom games.
    Returns list of code strings.
    """
    base = _tournament_base(use_stub)
    url = f"{base}/codes?count={count}&tournamentId={tournament_id}"
    body = {
        "mapType": map_type,
        "pickType": pick_type,
        "teamSize": team_size,
        "spectatorType": spectator_type,
    }
    if metadata:
        body["metadata"] = metadata

    r = httpx.post(url, json=body, headers=_headers(), timeout=15)
    r.raise_for_status()
    codes = r.json()
    log.info(f"Generated {len(codes)} tournament codes")
    return codes


# ── Match-v5 ────────────────────────────────────────────────────────────────

def get_match_by_id(match_id: str, platform: str = "euw1") -> Optional[dict]:
    """
    Fetch full match data from match-v5.
    match_id format: "EUW1_1234567890"
    """
    region = _routing_region(platform)
    url = f"https://{region}.api.riotgames.com/lol/match/v5/matches/{match_id}"
    try:
        r = httpx.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"Failed to fetch match {match_id}: {e}")
        return None


def get_match_ids_by_puuid(puuid: str, platform: str = "euw1",
                           count: int = 5) -> list[str]:
    """Get recent match IDs for a player by their PUUID."""
    region = _routing_region(platform)
    url = (f"https://{region}.api.riotgames.com/lol/match/v5/matches/by-puuid/"
           f"{puuid}/ids?count={count}")
    try:
        r = httpx.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"Failed to fetch match IDs for {puuid}: {e}")
        return []


@dataclass
class ParsedParticipant:
    """Parsed participant data from match-v5."""
    puuid: str
    champion_id: int
    champion_name: str
    kills: int
    deaths: int
    assists: int
    total_damage_to_champions: int
    vision_score: int
    cs: int  # totalMinionsKilled + neutralMinionsKilled
    gold_earned: int
    win: bool
    team_id: int  # 100 = blue, 200 = red


def parse_match_data(match_data: dict) -> dict:
    """
    Parse raw match-v5 data into a structured format.
    Returns {
        game_duration: int (seconds),
        participants: list[ParsedParticipant],
        winning_team: int (100 or 200),
    }
    """
    info = match_data.get("info", {})
    duration = info.get("gameDuration", 0)
    participants = []
    winning_team = 100

    for p in info.get("participants", []):
        cs = p.get("totalMinionsKilled", 0) + p.get("neutralMinionsKilled", 0)
        parsed = ParsedParticipant(
            puuid=p.get("puuid", ""),
            champion_id=p.get("championId", 0),
            champion_name=p.get("championName", "Unknown"),
            kills=p.get("kills", 0),
            deaths=p.get("deaths", 0),
            assists=p.get("assists", 0),
            total_damage_to_champions=p.get("totalDamageDealtToChampions", 0),
            vision_score=p.get("visionScore", 0),
            cs=cs,
            gold_earned=p.get("goldEarned", 0),
            win=p.get("win", False),
            team_id=p.get("teamId", 100),
        )
        participants.append(parsed)
        if parsed.win:
            winning_team = parsed.team_id

    return {
        "game_duration": duration,
        "participants": participants,
        "winning_team": winning_team,
    }


def get_match_timeline(match_id: str, platform: str = "euw1") -> Optional[dict]:
    """Fetch match timeline data (optional, for advanced stats)."""
    region = _routing_region(platform)
    url = f"https://{region}.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
    try:
        r = httpx.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"Failed to fetch timeline for {match_id}: {e}")
        return None


# ── Account lookup (enhanced) ───────────────────────────────────────────────

def get_puuid_by_riot_id(game_name: str, tag_line: str,
                         region: str = "europe") -> Optional[str]:
    """Look up a player's PUUID via Riot Account-v1."""
    url = (f"https://{region}.api.riotgames.com"
           f"/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}")
    try:
        r = httpx.get(url, headers=_headers(), timeout=10)
        r.raise_for_status()
        return r.json().get("puuid")
    except Exception as e:
        log.error(f"PUUID lookup failed for {game_name}#{tag_line}: {e}")
        return None
