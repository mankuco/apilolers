"""
EloCalculator v3 – Role-weighted performance, dynamic K, streak bonuses.

PARAMETERS:
  ELO_INICIAL  = 1200
  ELO_MIN      = 600
  ELO_MAX      = 2000
  CALIBRATION  = 5 games

K-FACTOR:
  games_played < 5  → K = 40  (calibration)
  player Elo > 1500 → K = 16
  team Elo diff > 200 → K = 12
  otherwise         → K = 24

PERFORMANCE (role-based):
  TOP/JUNGLE/MID: 0.40 dmg/min + 0.35 kda + 0.25 objective_participation
  ADC:            0.40 dmg/min + 0.35 cs/min + 0.25 kda
  SUPPORT:        0.40 vision/min + 0.35 kill_part + 0.25 dmg_mitigated/min
  TANK:           0.40 dmg_taken/min + 0.35 obj_part + 0.25 kill_part

  factor_contribucion = 1.0 + clamp(score * 0.5, -0.3, +0.3)  → [0.7, 1.3]
  Calibration players (< 5 games) → factor = 1.0

STREAKS:
  3 consecutive wins  → delta × 1.10 that game
  3 consecutive losses → next game uses K × 1.2

FINAL:
  delta = delta_base × factor_contribucion [× streak multiplier]
  new_elo = clamp(elo + delta, ELO_MIN, ELO_MAX)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# ── Constants ─────────────────────────────────────────────────────────────

ELO_INICIAL = 1200
ELO_MIN = 600
ELO_MAX = 2000
CALIBRATION_GAMES = 5


@dataclass
class EloResult:
    player_id: int
    elo_before: float
    elo_after: float
    delta: float
    delta_base: float = 0.0
    performance_mod: float = 0.0       # kept for backwards compat in API
    activity_bonus: float = 0.0        # now always 0 (decay is jornada-based)
    award_bonus: float = 0.0
    performance_score: float = 0.0
    is_mvp: bool = False
    is_ace: bool = False
    k_used: float = 24.0
    contribution_factor: float = 1.0
    streak_multiplier: float = 1.0


@dataclass
class PlayerPerformance:
    """Raw stats from match-v5 for one player."""
    player_id: int
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    total_damage_to_champions: int = 0
    total_damage_taken: int = 0
    damage_mitigated: int = 0
    vision_score: int = 0
    cs: int = 0
    gold_earned: int = 0
    kill_participation: float = 0.0
    objective_participation: float = 0.0   # (baron+dragon+tower kills) / team total
    role: str = ""                         # TOP, JUNGLE, MID, ADC, SUPPORT
    game_duration_minutes: float = 25.0


class EloCalculator:
    """Stateless calculator – v3 with role-based performance."""

    MVP_BONUS: float = 2.0
    ACE_BONUS: float = 1.0

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
        Optional: games_played, win_streak, loss_streak
        """
        avg_blue = self._avg_elo(blue_players)
        avg_red = self._avg_elo(red_players)
        team_elo_diff = abs(avg_blue - avg_red)

        team_totals = self._team_totals(performances, blue_players, red_players)

        results: list[EloResult] = []

        for p in blue_players:
            results.append(self._calc(
                p, avg_blue, avg_red, team_elo_diff,
                winner == "Blue", mvp_id, ace_id,
                performances, team_totals, "blue",
            ))

        for p in red_players:
            results.append(self._calc(
                p, avg_red, avg_blue, team_elo_diff,
                winner == "Red", mvp_id, ace_id,
                performances, team_totals, "red",
            ))

        return results

    # ── K Factor ──────────────────────────────────────────────────────────

    @staticmethod
    def compute_k(player_elo: float, games_played: int, team_elo_diff: float,
                  loss_streak: int = 0) -> float:
        """
        Dynamic K-factor:
          calibration (< 5 games) → 40
          Elo > 1500              → 16
          team diff > 200         → 12
          else                    → 24
        Then: 3 consecutive losses → K × 1.2 for next game
        """
        if games_played < CALIBRATION_GAMES:
            k = 40.0
        elif player_elo > 1500:
            k = 16.0
        elif team_elo_diff > 200:
            k = 12.0
        else:
            k = 24.0

        # Loss streak K boost (applies when entering the match with 3+ losses)
        if loss_streak >= 3:
            k *= 1.2

        return k

    # ── Role-based Performance Score ─────────────────────────────────────

    @staticmethod
    def _detect_role(perf: PlayerPerformance, team_damage_taken: int) -> str:
        """
        Detect effective role. If the player's role is TOP or JUNGLE and they
        absorbed > 35% of team damage taken → TANK.
        """
        role = (perf.role or "").upper().strip()
        if role in ("TOP", "JUNGLE") and team_damage_taken > 0:
            if perf.total_damage_taken / team_damage_taken > 0.35:
                return "TANK"
        return role if role in ("TOP", "JUNGLE", "MID", "ADC", "SUPPORT", "BOTTOM") else ""

    @staticmethod
    def compute_role_performance(
        perf: PlayerPerformance,
        role: str,
        team_kills: int,
        team_damage: int,
        team_vision: int,
    ) -> float:
        """
        Role-weighted performance score (raw, centered around 0).
        Returns a value roughly in [-1, +1].
        """
        dur = max(perf.game_duration_minutes, 1.0)
        kda = (perf.kills + perf.assists) / max(perf.deaths, 1)
        kda_norm = min(kda, 10.0) / 10.0  # [0, 1]
        dmg_per_min = perf.total_damage_to_champions / dur
        cs_per_min = perf.cs / dur
        vis_per_min = perf.vision_score / dur
        dmg_taken_per_min = perf.total_damage_taken / dur
        dmg_mitigated_per_min = perf.damage_mitigated / dur
        kp = perf.kill_participation if perf.kill_participation > 0 else (
            (perf.kills + perf.assists) / max(team_kills, 1)
        )
        obj_part = perf.objective_participation

        # Normalize to [0,1] ranges with reasonable benchmarks
        dmg_norm = min(dmg_per_min / 1200.0, 1.0)        # 1200 dpm = very high
        cs_norm = min(cs_per_min / 10.0, 1.0)             # 10 cs/min = excellent
        vis_norm = min(vis_per_min / 4.0, 1.0)            # 4 vis/min = excellent sup
        taken_norm = min(dmg_taken_per_min / 1500.0, 1.0)  # tank benchmark
        mitigated_norm = min(dmg_mitigated_per_min / 800.0, 1.0)

        if role == "ADC" or role == "BOTTOM":
            raw = 0.40 * dmg_norm + 0.35 * cs_norm + 0.25 * kda_norm
        elif role == "SUPPORT":
            raw = 0.40 * vis_norm + 0.35 * kp + 0.25 * mitigated_norm
        elif role == "TANK":
            raw = 0.40 * taken_norm + 0.35 * obj_part + 0.25 * kp
        elif role in ("TOP", "JUNGLE", "MID"):
            raw = 0.40 * dmg_norm + 0.35 * kda_norm + 0.25 * obj_part
        else:
            # Fallback: generic balanced
            raw = 0.30 * dmg_norm + 0.30 * kda_norm + 0.20 * kp + 0.20 * vis_norm

        # Center around 0: average expected raw ≈ 0.40
        centered = (raw - 0.40) / 0.40
        return max(-1.0, min(1.0, centered))

    # ── Legacy performance (no role data) ────────────────────────────────

    @staticmethod
    def compute_performance_score(
        perf: PlayerPerformance,
        team_kills: int,
        team_damage: int,
        team_vision: int,
        team_gold: int,
    ) -> float:
        """Legacy fallback when no role data available."""
        kda_raw = (perf.kills + perf.assists) / max(perf.deaths, 1)
        kda_norm = min(kda_raw, 10.0) / 10.0
        kp = perf.kill_participation if perf.kill_participation > 0 else (
            (perf.kills + perf.assists) / max(team_kills, 1)
        )
        dmg_share = perf.total_damage_to_champions / max(team_damage, 1)
        vis_share = perf.vision_score / max(team_vision, 1)
        gold_share = perf.gold_earned / max(team_gold, 1)
        raw = 0.35 * kda_norm + 0.20 * kp + 0.20 * dmg_share + 0.15 * vis_share + 0.10 * gold_share
        centered = (raw - 0.385) / 0.385
        return max(-1.0, min(1.0, centered))

    # ── Activity (kept for backward compat but returns 0) ────────────────

    @staticmethod
    def compute_activity_bonus(last_played=None, now=None) -> float:
        """Deprecated: decay is now jornada-based. Returns 0."""
        return 0.0

    # ── Inactivity Decay (jornada-based) ─────────────────────────────────

    @staticmethod
    def compute_decay(ausencias_consecutivas: int, elo_inicio_temporada: float,
                      current_elo: float) -> float:
        """
        Decay per jornada missed. Returns the penalty (positive number to subtract).
        Never drops below elo_inicio_temporada.
        """
        if ausencias_consecutivas <= 2:
            penalty = 0.0
        elif ausencias_consecutivas <= 4:
            penalty = 8.0
        elif ausencias_consecutivas <= 6:
            penalty = 15.0
        else:
            penalty = 20.0

        # Don't decay below season start Elo
        max_decay = max(current_elo - elo_inicio_temporada, 0.0)
        return min(penalty, max_decay)

    # ── internals ────────────────────────────────────────────────────────

    @staticmethod
    def _avg_elo(players: list[dict]) -> float:
        if not players:
            return ELO_INICIAL
        return sum(p["tournament_elo"] for p in players) / len(players)

    @staticmethod
    def _expected(team_elo: float, opp_elo: float) -> float:
        return 1.0 / (1.0 + 10 ** ((opp_elo - team_elo) / 400.0))

    def _team_totals(self, performances, blue, red):
        if not performances:
            return {}

        def _sum_team(team):
            totals = {"kills": 0, "damage": 0, "vision": 0, "gold": 0, "damage_taken": 0}
            for p in team:
                perf = performances.get(p["id"])
                if perf:
                    totals["kills"] += perf.kills
                    totals["damage"] += perf.total_damage_to_champions
                    totals["vision"] += perf.vision_score
                    totals["gold"] += perf.gold_earned
                    totals["damage_taken"] += perf.total_damage_taken
            return totals

        return {"blue": _sum_team(blue), "red": _sum_team(red)}

    def _calc(
        self,
        player: dict,
        team_avg: float,
        opp_avg: float,
        team_elo_diff: float,
        won: bool,
        mvp_id: Optional[int],
        ace_id: Optional[int],
        performances: Optional[dict],
        team_totals: dict,
        side: str,
    ) -> EloResult:
        pid = player["id"]
        r = player["tournament_elo"]
        games = player.get("games_played", 0)
        win_streak = player.get("win_streak", 0)
        loss_streak = player.get("loss_streak", 0)

        # 1. K factor
        k = self.compute_k(r, games, team_elo_diff, loss_streak)

        # 2. Delta base
        E = self._expected(team_avg, opp_avg)
        S = 1.0 if won else 0.0
        delta_base = k * (S - E)

        # 3. Contribution factor (role-based performance)
        perf_score = 0.0
        contribution = 1.0
        if performances and pid in performances and games >= CALIBRATION_GAMES:
            perf = performances[pid]
            tt = team_totals.get(side, {})
            role = self._detect_role(perf, tt.get("damage_taken", 0))
            if role:
                perf_score = self.compute_role_performance(
                    perf, role,
                    team_kills=tt.get("kills", 1),
                    team_damage=tt.get("damage", 1),
                    team_vision=tt.get("vision", 1),
                )
            else:
                perf_score = self.compute_performance_score(
                    perf,
                    team_kills=tt.get("kills", 1),
                    team_damage=tt.get("damage", 1),
                    team_vision=tt.get("vision", 1),
                    team_gold=tt.get("gold", 1),
                )
            # factor_contribucion = 1.0 + clamp(score × 0.5, -0.3, +0.3)
            contribution = 1.0 + max(-0.3, min(0.3, perf_score * 0.5))

        # 4. Individual delta
        delta = delta_base * contribution

        # 5. Streak bonus
        streak_mult = 1.0
        if won and win_streak >= 2:  # will become 3 after this game
            streak_mult = 1.10
            delta *= streak_mult

        # 6. MVP / ACE bonus (additive, after multiplication)
        is_mvp = pid == mvp_id
        is_ace = pid == ace_id
        award = 0.0
        if is_mvp:
            award = self.MVP_BONUS
        elif is_ace:
            award = self.ACE_BONUS
        delta += award

        # 7. Clamp final Elo
        new_r = max(ELO_MIN, min(ELO_MAX, r + delta))
        actual_delta = new_r - r

        return EloResult(
            player_id=pid,
            elo_before=r,
            elo_after=round(new_r, 2),
            delta=round(actual_delta, 2),
            delta_base=round(delta_base, 2),
            performance_mod=round((contribution - 1.0) * delta_base, 2),
            activity_bonus=0.0,
            award_bonus=round(award, 2),
            performance_score=round(perf_score, 4),
            is_mvp=is_mvp,
            is_ace=is_ace,
            k_used=round(k, 1),
            contribution_factor=round(contribution, 3),
            streak_multiplier=round(streak_mult, 2),
        )
