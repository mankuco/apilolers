"""
EloCalculator v2 – Performance-weighted Elo with activity bonus.

Formula:
  finalDelta = clamp(deltaBase + performanceModifier + activityBonus + awardBonus, -28, +28)

Where:
  deltaBase           = K * (S - E)                     K=24
  performanceModifier = performanceScore * 4             capped at [-4, +4]
  activityBonus       = f(days_since_last_game)          [-2, +2]
  awardBonus          = MVP +2, ACE +1

performanceScore (from Riot match-v5 data):
  0.35 * normalizedKDA
  0.20 * killParticipation
  0.20 * damageShare
  0.15 * visionShare
  0.10 * csGoldShare
  → range [-1, +1], then * 4 → [-4, +4]
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
from datetime import datetime, timedelta


@dataclass
class EloResult:
    player_id: int
    elo_before: float
    elo_after: float
    delta: float
    delta_base: float = 0.0
    performance_mod: float = 0.0
    activity_bonus: float = 0.0
    award_bonus: float = 0.0
    performance_score: float = 0.0
    is_mvp: bool = False
    is_ace: bool = False


@dataclass
class PlayerPerformance:
    """Raw stats from match-v5 for one player."""
    player_id: int
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    total_damage_to_champions: int = 0
    vision_score: int = 0
    cs: int = 0          # totalMinionsKilled + neutralMinionsKilled
    gold_earned: int = 0
    kill_participation: float = 0.0  # pre-computed or we compute it


class EloCalculator:
    """Stateless calculator – easy to unit-test."""

    K_FACTOR: float = 24.0
    CLAMP_MIN: float = -28.0
    CLAMP_MAX: float = 28.0
    PERF_MULTIPLIER: float = 4.0   # performance_score * this
    MVP_BONUS: float = 2.0
    ACE_BONUS: float = 1.0

    # Catch-up (kept from v1 – helps new mid-season players)
    CATCH_UP_THRESHOLD: float = 150.0
    CATCH_UP_K_MULT: float = 1.3

    # ── public API ───────────────────────────────────────────────────────

    def resolve_match(
        self,
        blue_players: list[dict],
        red_players: list[dict],
        winner: str,
        mvp_id: Optional[int] = None,
        ace_id: Optional[int] = None,
        performances: Optional[dict[int, PlayerPerformance]] = None,
    ) -> list[EloResult]:
        """
        Compute new Elo for every player.

        Each player dict must have: id, tournament_elo, api_elo
        Optionally: last_played (ISO str or None)

        performances: {player_id: PlayerPerformance} from match-v5.
          If None, performance modifier is 0 for all.
        """
        avg_blue = self._avg_elo(blue_players)
        avg_red = self._avg_elo(red_players)

        # Pre-compute team totals for performance normalization
        all_players = blue_players + red_players
        team_totals = self._team_totals(performances, blue_players, red_players, winner)

        results: list[EloResult] = []

        for p in blue_players:
            won = winner == "Blue"
            side = "blue"
            results.append(self._calc(
                p, avg_blue, avg_red, won, mvp_id, ace_id,
                performances, team_totals, side,
            ))

        for p in red_players:
            won = winner == "Red"
            side = "red"
            results.append(self._calc(
                p, avg_red, avg_blue, won, mvp_id, ace_id,
                performances, team_totals, side,
            ))

        return results

    # ── Performance Score ────────────────────────────────────────────────

    @staticmethod
    def compute_performance_score(
        perf: PlayerPerformance,
        team_kills: int,
        team_damage: int,
        team_vision: int,
        team_gold: int,
    ) -> float:
        """
        Returns a score in [-1, +1] based on match-v5 stats.

        0.35 * normalizedKDA      (KDA capped at 10, then /10, centered at 0.5)
        0.20 * killParticipation  (already 0-1, centered at ~0.5)
        0.20 * damageShare        (share of team damage, centered at 0.2 for 5-man)
        0.15 * visionShare        (share of team vision, centered at 0.2)
        0.10 * csGoldShare        (share of team gold, centered at 0.2)
        """
        # KDA: (K + A) / max(D, 1), capped at 10 → normalized to [0, 1]
        kda_raw = (perf.kills + perf.assists) / max(perf.deaths, 1)
        kda_norm = min(kda_raw, 10.0) / 10.0  # 0 to 1

        kp = perf.kill_participation if perf.kill_participation > 0 else (
            (perf.kills + perf.assists) / max(team_kills, 1)
        )

        dmg_share = perf.total_damage_to_champions / max(team_damage, 1)
        vis_share = perf.vision_score / max(team_vision, 1)
        gold_share = perf.gold_earned / max(team_gold, 1)

        # Raw composite (roughly 0 to 1, center ~0.4)
        raw = (
            0.35 * kda_norm +
            0.20 * kp +
            0.20 * dmg_share +
            0.15 * vis_share +
            0.10 * gold_share
        )

        # Center around 0 and scale to [-1, +1]
        # Average expected raw ≈ 0.35*0.5 + 0.20*0.6 + 0.20*0.2 + 0.15*0.2 + 0.10*0.2
        #                     ≈ 0.175 + 0.12 + 0.04 + 0.03 + 0.02 = 0.385
        centered = (raw - 0.385) / 0.385  # roughly [-1, +1]
        return max(-1.0, min(1.0, centered))

    # ── Activity Bonus ───────────────────────────────────────────────────

    @staticmethod
    def compute_activity_bonus(last_played: Optional[str], now: Optional[datetime] = None) -> float:
        """
        +2 if played in last 14 days
        +1 if played in last 30 days
         0 if 30-45 days
        -2 if >45 days inactive
        """
        if not last_played:
            return 0.0  # no history yet, neutral

        now = now or datetime.utcnow()
        try:
            lp = datetime.fromisoformat(last_played.replace("Z", "+00:00"))
            # Make both naive for comparison
            if lp.tzinfo:
                lp = lp.replace(tzinfo=None)
        except (ValueError, AttributeError):
            return 0.0

        days = (now - lp).days

        if days <= 14:
            return 2.0
        elif days <= 30:
            return 1.0
        elif days <= 45:
            return 0.0
        else:
            return -2.0

    # ── internals ────────────────────────────────────────────────────────

    @staticmethod
    def _avg_elo(players: list[dict]) -> float:
        return sum(p["tournament_elo"] for p in players) / len(players)

    @staticmethod
    def _expected(team_elo: float, opp_elo: float) -> float:
        return 1.0 / (1.0 + 10 ** ((opp_elo - team_elo) / 400.0))

    def _team_totals(self, performances, blue, red, winner):
        """Pre-compute team-level aggregates for performance normalization."""
        if not performances:
            return {}

        def _sum_team(team):
            totals = {"kills": 0, "damage": 0, "vision": 0, "gold": 0}
            for p in team:
                perf = performances.get(p["id"])
                if perf:
                    totals["kills"] += perf.kills
                    totals["damage"] += perf.total_damage_to_champions
                    totals["vision"] += perf.vision_score
                    totals["gold"] += perf.gold_earned
            return totals

        return {
            "blue": _sum_team(blue),
            "red": _sum_team(red),
        }

    def _calc(
        self,
        player: dict,
        team_avg: float,
        opp_avg: float,
        won: bool,
        mvp_id: Optional[int],
        ace_id: Optional[int],
        performances: Optional[dict],
        team_totals: dict,
        side: str,
    ) -> EloResult:
        pid = player["id"]
        r = player["tournament_elo"]
        api = player["api_elo"]

        # 1. Delta base
        E = self._expected(team_avg, opp_avg)
        S = 1.0 if won else 0.0
        k = self.K_FACTOR
        if api - r > self.CATCH_UP_THRESHOLD:
            k *= self.CATCH_UP_K_MULT
        delta_base = k * (S - E)

        # 2. Performance modifier
        perf_score = 0.0
        perf_mod = 0.0
        if performances and pid in performances:
            perf = performances[pid]
            tt = team_totals.get(side, {})
            perf_score = self.compute_performance_score(
                perf,
                team_kills=tt.get("kills", 1),
                team_damage=tt.get("damage", 1),
                team_vision=tt.get("vision", 1),
                team_gold=tt.get("gold", 1),
            )
            perf_mod = perf_score * self.PERF_MULTIPLIER
            # Hard cap: performance ≤ 20% of |deltaBase|
            max_perf = abs(delta_base) * 0.20
            perf_mod = max(-max_perf, min(max_perf, perf_mod)) if delta_base != 0 else 0.0

        # 3. Activity bonus
        last_played = player.get("last_played")
        activity = self.compute_activity_bonus(last_played)

        # 4. Award bonus
        is_mvp = pid == mvp_id
        is_ace = pid == ace_id
        award = 0.0
        if is_mvp:
            award = self.MVP_BONUS
        elif is_ace:
            award = self.ACE_BONUS

        # Final delta with clamp
        raw_delta = delta_base + perf_mod + activity + award
        delta = max(self.CLAMP_MIN, min(self.CLAMP_MAX, raw_delta))

        new_r = r + delta

        return EloResult(
            player_id=pid,
            elo_before=r,
            elo_after=round(new_r, 2),
            delta=round(delta, 2),
            delta_base=round(delta_base, 2),
            performance_mod=round(perf_mod, 2),
            activity_bonus=round(activity, 2),
            award_bonus=round(award, 2),
            performance_score=round(perf_score, 4),
            is_mvp=is_mvp,
            is_ace=is_ace,
        )
