"""
Riot Games API integration.

Uses direct HTTPS requests (httpx).
Set the RIOT_API_KEY environment variable to enable live lookups.
Falls back gracefully when the key is missing or the API is unreachable.
"""

from __future__ import annotations
import httpx
from typing import Optional
from riot_key import get_api_key

# ── Tier → numeric Elo mapping ──────────────────────────────────────────────
TIER_MAP: dict[str, int] = {
    "IRON":        400,
    "BRONZE":      600,
    "SILVER":      800,
    "GOLD":       1000,
    "PLATINUM":   1200,
    "EMERALD":    1400,
    "DIAMOND":    1600,
    "MASTER":     1800,
    "GRANDMASTER":2000,
    "CHALLENGER":  2200,
}

DIVISION_MAP: dict[str, int] = {
    "IV": 0,
    "III": 50,
    "II": 100,
    "I": 150,
}


def tier_to_elo(tier: str, division: str = "IV", lp: int = 0) -> float:
    """Convert a Riot tier/division/LP string to a numeric Elo value."""
    base = TIER_MAP.get(tier.upper(), 1000)
    div_bonus = DIVISION_MAP.get(division.upper(), 0)
    lp_bonus = lp * 0.5  # roughly half an LP as Elo points
    return base + div_bonus + lp_bonus


def parse_name_tag(name_tag: str) -> tuple[str, str]:
    """
    Parse 'GameName#TagLine' into (game_name, tag_line).
    e.g. 'Target#EUW' -> ('Target', 'EUW')
    """
    parts = name_tag.split("#", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid name#tag format: {name_tag}")
    return parts[0].strip(), parts[1].strip()


def _get_region_for_tag(tag: str) -> tuple[str, str]:
    """
    Return (account_region, platform) based on the tag-line hint.
    This is a simplification; in production you'd let the user pick.
    """
    tag_upper = tag.upper()
    if tag_upper in ("EUW", "EUW1", "EUNE", "EUN1"):
        return "europe", "euw1" if "EUW" in tag_upper else "eun1"
    elif tag_upper in ("NA", "NA1"):
        return "americas", "na1"
    elif tag_upper in ("KR",):
        return "asia", "kr"
    elif tag_upper in ("JP", "JP1"):
        return "asia", "jp1"
    elif tag_upper in ("BR", "BR1"):
        return "americas", "br1"
    elif tag_upper in ("LAN", "LA1"):
        return "americas", "la1"
    elif tag_upper in ("LAS", "LA2"):
        return "americas", "la2"
    elif tag_upper in ("OCE", "OC1"):
        return "sea", "oc1"
    elif tag_upper in ("TR", "TR1"):
        return "europe", "tr1"
    elif tag_upper in ("RU",):
        return "europe", "ru"
    else:
        return "europe", "euw1"


def fetch_player_rank(name_tag: str) -> dict | None:
    """
    Look up a player's Solo/Duo rank via the Riot API.

    Returns dict with keys: tier, division, lp, elo   or None on failure.
    On failure, returns dict with "error" key describing the problem.
    """
    import logging
    log = logging.getLogger(__name__)

    api_key = get_api_key()
    if not api_key:
        return {"error": "No Riot API key configured. Set it in the Tournament tab."}

    game_name, tag_line = parse_name_tag(name_tag)
    account_region, platform = _get_region_for_tag(tag_line)

    headers = {"X-Riot-Token": api_key}
    timeout = httpx.Timeout(10.0)

    try:
        # Step 1 – get PUUID via Riot Account-v1
        acct_url = (
            f"https://{account_region}.api.riotgames.com"
            f"/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        )
        log.info("Riot lookup step 1: %s", acct_url)
        r = httpx.get(acct_url, headers=headers, timeout=timeout)
        if r.status_code == 403:
            return {"error": "API key is invalid or expired (403 Forbidden)."}
        if r.status_code == 404:
            return {"error": f"Player '{game_name}#{tag_line}' not found on Riot servers."}
        if r.status_code == 429:
            return {"error": "Riot API rate limit exceeded. Try again in a minute."}
        r.raise_for_status()
        puuid = r.json()["puuid"]

        # Step 2 – get summoner ID via Summoner-v4
        summ_url = (
            f"https://{platform}.api.riotgames.com"
            f"/lol/summoner/v4/summoners/by-puuid/{puuid}"
        )
        log.info("Riot lookup step 2: %s", summ_url)
        r2 = httpx.get(summ_url, headers=headers, timeout=timeout)
        if r2.status_code == 403:
            return {"error": "API key lacks summoner-v4 access (403)."}
        if r2.status_code == 404:
            return {"error": f"Summoner not found on platform '{platform}'. Wrong region?"}
        r2.raise_for_status()
        summoner_id = r2.json()["id"]

        # Step 3 – get ranked data via League-v4
        league_url = (
            f"https://{platform}.api.riotgames.com"
            f"/lol/league/v4/entries/by-summoner/{summoner_id}"
        )
        log.info("Riot lookup step 3: %s", league_url)
        r3 = httpx.get(league_url, headers=headers, timeout=timeout)
        r3.raise_for_status()

        for entry in r3.json():
            if entry["queueType"] == "RANKED_SOLO_5x5":
                tier = entry["tier"]
                div = entry["rank"]
                lp = entry.get("leaguePoints", 0)
                return {
                    "tier": tier,
                    "division": div,
                    "lp": lp,
                    "elo": tier_to_elo(tier, div, lp),
                }

        # Player has no Solo/Duo rank → return unranked placeholder
        return {"tier": "UNRANKED", "division": "", "lp": 0, "elo": 1000.0}

    except httpx.ConnectError:
        return {"error": "Cannot reach Riot API servers. Check your network connection."}
    except httpx.TimeoutException:
        return {"error": "Riot API request timed out. Try again later."}
    except Exception as exc:
        log.exception("Riot lookup failed")
        return {"error": f"Unexpected error: {str(exc)}"}


# ── Champion list (static subset for dropdowns) ─────────────────────────────
POPULAR_CHAMPIONS: list[str] = [
    "Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Amumu", "Anivia",
    "Annie", "Aphelios", "Ashe", "Aurelion Sol", "Aurora", "Azir",
    "Bard", "Bel'Veth", "Blitzcrank", "Brand", "Braum", "Briar",
    "Caitlyn", "Camille", "Cassiopeia", "Cho'Gath", "Corki",
    "Darius", "Diana", "Draven", "Dr. Mundo",
    "Ekko", "Elise", "Evelynn", "Ezreal",
    "Fiddlesticks", "Fiora", "Fizz",
    "Galio", "Gangplank", "Garen", "Gnar", "Gragas", "Graves", "Gwen",
    "Hecarim", "Heimerdinger", "Hwei",
    "Illaoi", "Irelia", "Ivern",
    "Janna", "Jarvan IV", "Jax", "Jayce", "Jhin", "Jinx",
    "K'Sante", "Kai'Sa", "Kalista", "Karma", "Karthus", "Kassadin",
    "Katarina", "Kayle", "Kayn", "Kennen", "Kha'Zix", "Kindred",
    "Kled", "Kog'Maw",
    "LeBlanc", "Lee Sin", "Leona", "Lillia", "Lissandra", "Lucian", "Lulu", "Lux",
    "Malphite", "Malzahar", "Maokai", "Master Yi", "Milio",
    "Miss Fortune", "Mordekaiser", "Morgana",
    "Naafiri", "Nami", "Nasus", "Nautilus", "Neeko", "Nidalee", "Nilah", "Nocturne", "Nunu & Willump",
    "Olaf", "Orianna", "Ornn",
    "Pantheon", "Poppy", "Pyke",
    "Qiyana", "Quinn",
    "Rakan", "Rammus", "Rek'Sai", "Rell", "Renata Glasc", "Renekton",
    "Rengar", "Riven", "Rumble", "Ryze",
    "Samira", "Sejuani", "Senna", "Seraphine", "Sett", "Shaco",
    "Shen", "Shyvana", "Singed", "Sion", "Sivir", "Skarner",
    "Smolder", "Sona", "Soraka", "Swain", "Sylas", "Syndra",
    "Tahm Kench", "Taliyah", "Talon", "Taric", "Teemo", "Thresh",
    "Tristana", "Trundle", "Tryndamere", "Twisted Fate", "Twitch",
    "Udyr", "Urgot",
    "Varus", "Vayne", "Veigar", "Vel'Koz", "Vex", "Vi", "Viego", "Viktor", "Vladimir", "Volibear",
    "Warwick", "Wukong",
    "Xayah", "Xerath", "Xin Zhao",
    "Yasuo", "Yone", "Yorick", "Yuumi",
    "Zac", "Zed", "Zeri", "Ziggs", "Zilean", "Zoe", "Zyra",
]
