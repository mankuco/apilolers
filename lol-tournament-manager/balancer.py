"""
MatchBalancer – Generates the most balanced 5v5 team split from 10 selected players.

Algorithm:
  Generate all C(10,5)/2 = 126 unique splits and pick the one
  with the smallest |avg_elo_A - avg_elo_B|.
"""

from __future__ import annotations
from itertools import combinations
from dataclasses import dataclass


@dataclass
class TeamSplit:
    team_blue: list[dict]
    team_red: list[dict]
    avg_blue_elo: float
    avg_red_elo: float
    elo_diff: float


class MatchBalancer:
    """Independent, stateless balancer – easy to unit-test."""

    def best_split(self, players: list[dict]) -> TeamSplit:
        """
        Given exactly 10 player dicts (must have 'id' and 'tournament_elo'),
        return the most balanced 5v5 split.
        """
        if len(players) != 10:
            raise ValueError(f"Expected 10 players, got {len(players)}")

        ids = list(range(10))
        best: TeamSplit | None = None
        seen: set[frozenset] = set()

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
                    team_blue=blue,
                    team_red=red,
                    avg_blue_elo=round(avg_b, 2),
                    avg_red_elo=round(avg_r, 2),
                    elo_diff=round(diff, 2),
                )

        return best  # type: ignore[return-value]

    def all_splits_sorted(self, players: list[dict], top_n: int = 5) -> list[TeamSplit]:
        """Return the top-N most balanced splits for admin review."""
        if len(players) != 10:
            raise ValueError(f"Expected 10 players, got {len(players)}")

        ids = list(range(10))
        splits: list[TeamSplit] = []
        seen: set[frozenset] = set()

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
