"""
Seed the database with 20 mock players (including the 3 specified)
and a handful of historical matches for demo purposes.
"""

import random
from database import init_db, add_player, get_all_players, DB_PATH
from riot_api import tier_to_elo

MOCK_PLAYERS = [
    # ── Required by spec ─────────────────────────────────────────────
    {"name": "Alex",     "tag": "Target#EUW",      "tier": "GOLD",     "div": "I"},
    {"name": "Elena",    "tag": "Shadow#NA1",       "tier": "EMERALD",  "div": "III"},
    {"name": "Marc",     "tag": "Crit#EUW",         "tier": "SILVER",   "div": "II"},
    # ── Generated diverse roster ─────────────────────────────────────
    {"name": "Sofia",    "tag": "Arcane#EUW",       "tier": "PLATINUM", "div": "IV"},
    {"name": "Lucas",    "tag": "Blaze#NA1",        "tier": "GOLD",     "div": "III"},
    {"name": "Mia",      "tag": "Frost#EUW",        "tier": "DIAMOND",  "div": "IV"},
    {"name": "Noah",     "tag": "Viper#EUW",        "tier": "SILVER",   "div": "IV"},
    {"name": "Olivia",   "tag": "Lunar#NA1",        "tier": "EMERALD",  "div": "I"},
    {"name": "Daniel",   "tag": "Storm#EUW",        "tier": "GOLD",     "div": "II"},
    {"name": "Leah",     "tag": "Ember#EUW",        "tier": "PLATINUM", "div": "II"},
    # ── Extra 10 to fill the 20-player pool ──────────────────────────
    {"name": "Kai",      "tag": "Nexus#KR",         "tier": "DIAMOND",  "div": "III"},
    {"name": "Zara",     "tag": "Eclipse#EUW",      "tier": "GOLD",     "div": "IV"},
    {"name": "Theo",     "tag": "Phantom#NA1",      "tier": "EMERALD",  "div": "II"},
    {"name": "Ines",     "tag": "Rune#EUW",         "tier": "PLATINUM", "div": "I"},
    {"name": "Hugo",     "tag": "Rift#EUW",         "tier": "SILVER",   "div": "I"},
    {"name": "Chloe",    "tag": "Sage#NA1",         "tier": "GOLD",     "div": "I"},
    {"name": "Leo",      "tag": "Aether#EUW",       "tier": "EMERALD",  "div": "IV"},
    {"name": "Nina",     "tag": "Zenith#EUW",       "tier": "PLATINUM", "div": "III"},
    {"name": "Felix",    "tag": "Chronos#NA1",      "tier": "DIAMOND",  "div": "II"},
    {"name": "Sara",     "tag": "Nova#EUW",         "tier": "SILVER",   "div": "III"},
]


def seed_players():
    """Insert mock players if the database is empty."""
    existing = get_all_players(active_only=False)
    if existing:
        print(f"Database already has {len(existing)} players – skipping seed.")
        return

    for p in MOCK_PLAYERS:
        elo = tier_to_elo(p["tier"], p["div"])
        # Add slight random jitter so tournament_elo isn't identical to api_elo
        t_elo = elo + random.randint(-30, 30)
        add_player(p["name"], p["tag"], api_elo=elo, tournament_elo=t_elo)
        print(f"  Added {p['name']:10s}  {p['tag']:20s}  API Elo={elo}  T.Elo={t_elo}")

    print(f"\nSeeded {len(MOCK_PLAYERS)} players.")


if __name__ == "__main__":
    init_db()
    seed_players()
