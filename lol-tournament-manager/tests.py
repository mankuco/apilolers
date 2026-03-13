"""
Unit tests for EloCalculator, MatchBalancer, and Database layer.
Run with:  python -m pytest tests.py -v
"""

import os
import tempfile
import pytest

from elo import EloCalculator, EloResult
from balancer import MatchBalancer
from riot_api import tier_to_elo
import database as db


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_player(pid, elo, api_elo=None):
    return {"id": pid, "tournament_elo": elo, "api_elo": api_elo or elo}


def _team(start_id, elos):
    return [_make_player(start_id + i, e) for i, e in enumerate(elos)]


# ══════════════════════════════════════════════════════════════════════════════
#  EloCalculator Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestEloCalculator:
    calc = EloCalculator()

    def test_even_match_winner_gains(self):
        blue = _team(1, [1200]*5)
        red  = _team(6, [1200]*5)
        results = self.calc.resolve_match(blue, red, "Blue")
        for r in results:
            if r.player_id <= 5:
                assert r.delta > 0, "Winner should gain Elo"
            else:
                assert r.delta < 0, "Loser should lose Elo"

    def test_even_match_symmetry(self):
        blue = _team(1, [1200]*5)
        red  = _team(6, [1200]*5)
        results = self.calc.resolve_match(blue, red, "Blue")
        total = sum(r.delta for r in results)
        assert abs(total) < 1.0, "Zero-sum (approximately) in even match"

    def test_underdog_wins_more(self):
        blue = _team(1, [1000]*5)  # weaker
        red  = _team(6, [1400]*5)  # stronger
        results = self.calc.resolve_match(blue, red, "Blue")  # underdog wins
        winner_gain = sum(r.delta for r in results if r.player_id <= 5)
        assert winner_gain > 80, "Underdogs should gain a lot"

    def test_mvp_bonus(self):
        blue = _team(1, [1200]*5)
        red  = _team(6, [1200]*5)
        results_no_mvp = self.calc.resolve_match(blue, red, "Blue", mvp_id=None)
        results_mvp    = self.calc.resolve_match(blue, red, "Blue", mvp_id=1)
        p1_no = next(r for r in results_no_mvp if r.player_id == 1)
        p1_yes = next(r for r in results_mvp if r.player_id == 1)
        assert p1_yes.delta > p1_no.delta, "MVP should gain more"
        assert p1_yes.is_mvp

    def test_ace_protection(self):
        blue = _team(1, [1200]*5)
        red  = _team(6, [1200]*5)
        results_no_ace = self.calc.resolve_match(blue, red, "Blue", ace_id=None)
        results_ace    = self.calc.resolve_match(blue, red, "Blue", ace_id=6)
        p6_no  = next(r for r in results_no_ace if r.player_id == 6)
        p6_yes = next(r for r in results_ace if r.player_id == 6)
        assert abs(p6_yes.delta) < abs(p6_no.delta), "ACE should lose less"
        assert p6_yes.is_ace

    def test_catch_up_multiplier(self):
        # Player with api_elo much higher than tournament_elo
        blue = [_make_player(1, 1000, api_elo=1400)] + _team(2, [1200]*4)
        red  = _team(6, [1200]*5)
        results = self.calc.resolve_match(blue, red, "Blue")
        p1 = next(r for r in results if r.player_id == 1)
        p2 = next(r for r in results if r.player_id == 2)
        assert p1.delta > p2.delta, "Catch-up player should gain more"


# ══════════════════════════════════════════════════════════════════════════════
#  MatchBalancer Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestMatchBalancer:
    bal = MatchBalancer()

    def test_requires_ten_players(self):
        with pytest.raises(ValueError):
            self.bal.best_split([_make_player(i, 1200) for i in range(9)])

    def test_even_elos_perfect_split(self):
        players = [_make_player(i, 1200) for i in range(10)]
        split = self.bal.best_split(players)
        assert split.elo_diff == 0.0

    def test_split_minimises_diff(self):
        elos = [1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450]
        players = [_make_player(i, e) for i, e in enumerate(elos)]
        split = self.bal.best_split(players)
        assert split.elo_diff <= 10, f"Diff too large: {split.elo_diff}"

    def test_all_splits_sorted(self):
        elos = [1000, 1100, 1200, 1300, 1400, 900, 1050, 1150, 1250, 1350]
        players = [_make_player(i, e) for i, e in enumerate(elos)]
        splits = self.bal.all_splits_sorted(players, top_n=5)
        assert len(splits) == 5
        for i in range(len(splits) - 1):
            assert splits[i].elo_diff <= splits[i+1].elo_diff


# ══════════════════════════════════════════════════════════════════════════════
#  Riot API Tier Mapping
# ══════════════════════════════════════════════════════════════════════════════

class TestTierMapping:
    def test_gold_one(self):
        assert tier_to_elo("GOLD", "I") == 1150

    def test_emerald_three(self):
        assert tier_to_elo("EMERALD", "III") == 1450

    def test_silver_two(self):
        assert tier_to_elo("SILVER", "II") == 900

    def test_lp_bonus(self):
        base = tier_to_elo("GOLD", "I", lp=0)
        with_lp = tier_to_elo("GOLD", "I", lp=50)
        assert with_lp > base


# ══════════════════════════════════════════════════════════════════════════════
#  Database Tests (using temp file)
# ══════════════════════════════════════════════════════════════════════════════

class TestDatabase:
    @pytest.fixture(autouse=True)
    def setup_db(self, tmp_path):
        self.db_path = str(tmp_path / "test.db")
        db.init_db(self.db_path)

    def test_add_and_get_player(self):
        pid = db.add_player("Test", "Test#EUW", 1200, db_path=self.db_path)
        p = db.get_player(pid, db_path=self.db_path)
        assert p["name"] == "Test"
        assert p["tournament_elo"] == 1200

    def test_archive_and_reactivate(self):
        pid = db.add_player("A", "A#EUW", 1200, db_path=self.db_path)
        db.archive_player(pid, db_path=self.db_path)
        active = db.get_all_players(active_only=True, db_path=self.db_path)
        assert len(active) == 0
        db.reactivate_player(pid, db_path=self.db_path)
        active = db.get_all_players(active_only=True, db_path=self.db_path)
        assert len(active) == 1

    def test_average_elo(self):
        db.add_player("A", "A#EUW", 1000, tournament_elo=1000, db_path=self.db_path)
        db.add_player("B", "B#EUW", 1400, tournament_elo=1400, db_path=self.db_path)
        avg = db.get_average_tournament_elo(db_path=self.db_path)
        assert avg == 1200.0

    def test_champion_stats(self):
        pid = db.add_player("X", "X#EUW", 1200, db_path=self.db_path)
        db.update_champion_stat(pid, "Ahri", won=True, picked=True, db_path=self.db_path)
        db.update_champion_stat(pid, "Ahri", won=False, picked=True, db_path=self.db_path)
        stats = db.get_player_champion_stats(pid, db_path=self.db_path)
        assert len(stats) == 1
        assert stats[0]["wins"] == 1
        assert stats[0]["losses"] == 1
        assert stats[0]["picks"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
