"""
MatchBalancer v3 – Snake draft by Elo.

Algorithm:
  1. Sort players by tournament_elo descending → [P1..P10]
  2. Team A = positions {1, 4, 5, 8, 9}  (0-indexed: 0, 3, 4, 7, 8)
     Team B = positions {2, 3, 6, 7, 10} (0-indexed: 1, 2, 5, 6, 9)
  3. Validate: |avg_A - avg_B| < 150, else warning
  4. With 20 players: split into two groups of 10 (1-10, 11-20) and apply independently

Also keeps the old brute-force method as a fallback option.
"""

from __future__ import annotations
from itertools import combinations
from dataclasses import dataclass, field


@dataclass
class TeamSplit:
    team_blue: list[dict]
    team_red: list[dict]
    avg_blue_elo: float
    avg_red_elo: float
    elo_diff: float
    warning: str = ""
    recommended: bool = False


# Snake draft positions (1-indexed as in spec → 0-indexed)
TEAM_A_POSITIONS = {0, 3, 4, 7, 8}  # 1st, 4th, 5th, 8th, 9th
TEAM_B_POSITIONS = {1, 2, 5, 6, 9}  # 2nd, 3rd, 6th, 7th, 10th


class MatchBalancer:
    """Team balancer with snake draft as primary and brute-force as fallback."""

    BALANCE_THRESHOLD = 150.0  # max acceptable avg Elo difference

    # ── Snake Draft (primary) ─────────────────────────────────────────────

    def snake_draft(self, players: list[dict]) -> TeamSplit:
        """
        Snake draft for exactly 10 players.
        Sort by Elo desc, assign by snake pattern.
        """
        if len(players) != 10:
            raise ValueError(f"Expected 10 players, got {len(players)}")

        sorted_players = sorted(players, key=lambda p: p["tournament_elo"], reverse=True)

        team_a = [sorted_players[i] for i in range(10) if i in TEAM_A_POSITIONS]
        team_b = [sorted_players[i] for i in range(10) if i in TEAM_B_POSITIONS]

        avg_a = sum(p["tournament_elo"] for p in team_a) / 5
        avg_b = sum(p["tournament_elo"] for p in team_b) / 5
        diff = abs(avg_a - avg_b)

        warning = ""
        if diff >= self.BALANCE_THRESHOLD:
            warning = f"Elo difference ({diff:.1f}) exceeds threshold ({self.BALANCE_THRESHOLD}). Teams may be unbalanced."

        return TeamSplit(
            team_blue=team_a,
            team_red=team_b,
            avg_blue_elo=round(avg_a, 2),
            avg_red_elo=round(avg_b, 2),
            elo_diff=round(diff, 2),
            warning=warning,
        )

    def snake_draft_20(self, players: list[dict]) -> list[TeamSplit]:
        """
        Apply snake draft for 20 players: split into two groups of 10
        (sorted by Elo, first 10 and last 10) and draft each independently.
        """
        if len(players) != 20:
            raise ValueError(f"Expected 20 players, got {len(players)}")

        sorted_all = sorted(players, key=lambda p: p["tournament_elo"], reverse=True)
        group1 = sorted_all[:10]
        group2 = sorted_all[10:]

        return [self.snake_draft(group1), self.snake_draft(group2)]

    # ── Brute-force (fallback / comparison) ──────────────────────────────

    def best_split(self, players: list[dict]) -> TeamSplit:
        """Brute-force: try all C(10,5)/2 splits, pick lowest diff."""
        if len(players) != 10:
            raise ValueError(f"Expected 10 players, got {len(players)}")

        ids = list(range(10))
        best = None
        seen = set()

        for combo in combinations(ids, 5):
            key = frozenset(combo)
            complement = frozenset(ids) - key
            if complement in seen:
                continue
            seen.add(key)

            blue = [players[i] for i in combo]
            red = [players[i] for i in complement]
            avg_b = sum(p["tournament_elo"] for p in blue) / 5
            avg_r = sum(p["tournament_elo"] for p in red) / 5
            diff = abs(avg_b - avg_r)

            if best is None or diff < best.elo_diff:
                best = TeamSplit(
                    team_blue=blue, team_red=red,
                    avg_blue_elo=round(avg_b, 2),
                    avg_red_elo=round(avg_r, 2),
                    elo_diff=round(diff, 2),
                )

        return best

    def all_splits_sorted(self, players: list[dict], top_n: int = 5) -> list[TeamSplit]:
        """Return top-N most balanced splits (brute-force)."""
        if len(players) != 10:
            raise ValueError(f"Expected 10 players, got {len(players)}")

        ids = list(range(10))
        splits = []
        seen = set()

        for combo in combinations(ids, 5):
            key = frozenset(combo)
            complement = frozenset(ids) - key
            if complement in seen:
                continue
            seen.add(key)

            blue = [players[i] for i in combo]
            red = [players[i] for i in complement]
            avg_b = sum(p["tournament_elo"] for p in blue) / 5
            avg_r = sum(p["tournament_elo"] for p in red) / 5
            diff = abs(avg_b - avg_r)

            splits.append(TeamSplit(
                team_blue=blue, team_red=red,
                avg_blue_elo=round(avg_b, 2),
                avg_red_elo=round(avg_r, 2),
                elo_diff=round(diff, 2),
            ))

        splits.sort(key=lambda s: s.elo_diff)
        return splits[:top_n]

    # ── Unified generate (used by API) ───────────────────────────────────

    def generate_teams(self, players: list[dict], method: str = "snake") -> list[TeamSplit]:
        """
        Generate team splits. method: "snake" (default) or "brute_force".
        Supports 10 or 20 players.

        "snake" returns the snake-draft split first (tagged recommended=True),
        then up to 3 brute-force alternatives that differ from the snake result.
        "brute_force" returns the top-3 most balanced splits only.
        """
        n = len(players)
        if method == "snake":
            if n == 20:
                return self.snake_draft_20(players)
            elif n == 10:
                snake = self.snake_draft(players)
                snake.recommended = True
                # Add brute-force alternatives that differ from the snake result
                bf_splits = self.all_splits_sorted(players, top_n=10)
                snake_ids = frozenset(p["id"] for p in snake.team_blue)
                alternatives = []
                for s in bf_splits:
                    s_ids = frozenset(p["id"] for p in s.team_blue)
                    # Skip if it's the same split (or mirror) as snake
                    if s_ids == snake_ids or s_ids == frozenset(p["id"] for p in snake.team_red):
                        continue
                    alternatives.append(s)
                    if len(alternatives) >= 3:
                        break
                return [snake] + alternatives
            else:
                raise ValueError(f"Snake draft requires 10 or 20 players, got {n}")
        else:
            if n == 10:
                return self.all_splits_sorted(players, top_n=3)
            elif n == 20:
                sorted_all = sorted(players, key=lambda p: p["tournament_elo"], reverse=True)
                return (
                    self.all_splits_sorted(sorted_all[:10], top_n=1) +
                    self.all_splits_sorted(sorted_all[10:], top_n=1)
                )
            else:
                raise ValueError(f"Brute-force requires 10 or 20 players, got {n}")
