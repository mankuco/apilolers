"""
LoL Internal Tournament Manager — Streamlit UI
================================================
Run with:  streamlit run app.py
"""

import streamlit as st
import pandas as pd
import json
from datetime import datetime

import database as db
from elo import EloCalculator
from balancer import MatchBalancer
from riot_api import (
    tier_to_elo, fetch_player_rank, parse_name_tag,
    TIER_MAP, DIVISION_MAP, POPULAR_CHAMPIONS,
)

# ── Initialisation ───────────────────────────────────────────────────────────
db.init_db()

# Seed on first run
if "seeded" not in st.session_state:
    from seed import seed_players
    seed_players()
    st.session_state["seeded"] = True

elo_calc = EloCalculator()
balancer = MatchBalancer()

# ── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="LoL Tournament Manager",
    page_icon="🏆",
    layout="wide",
)

# ── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .team-blue { background: #1a3a5c; color: white; padding: 1rem; border-radius: 8px; }
    .team-red  { background: #5c1a1a; color: white; padding: 1rem; border-radius: 8px; }
    .elo-pos   { color: #4caf50; font-weight: bold; }
    .elo-neg   { color: #f44336; font-weight: bold; }
    .stat-card {
        background: #1e1e2e; color: white; padding: 1.2rem;
        border-radius: 10px; text-align: center; margin-bottom: 0.5rem;
    }
    .stat-card h2 { margin: 0; font-size: 2rem; }
    .stat-card p  { margin: 0; font-size: 0.85rem; opacity: 0.7; }
</style>
""", unsafe_allow_html=True)

# ── Sidebar Navigation ──────────────────────────────────────────────────────
st.sidebar.title("🏆 Tournament Manager")
page = st.sidebar.radio("Navigate", [
    "📊 Dashboard",
    "👥 Players",
    "⚔️ Matchmaking",
    "📝 Record Match",
    "📜 Match History",
    "📈 Statistics",
])

# ══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
if page == "📊 Dashboard":
    st.title("📊 Tournament Dashboard")

    players = db.get_all_players()
    matches = db.get_all_matches()

    # KPI row
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Active Players", len(players))
    c2.metric("Total Matches", len(matches))
    avg_elo = round(sum(p["tournament_elo"] for p in players) / len(players), 1) if players else 0
    c3.metric("Avg Tournament Elo", avg_elo)
    top = players[0] if players else None
    c4.metric("Top Rated", f"{top['name']} ({round(top['tournament_elo'])})" if top else "—")

    st.divider()

    # Leaderboard
    st.subheader("🏅 Leaderboard")
    if players:
        lb = pd.DataFrame(players)[
            ["name", "lol_name_tag", "tournament_elo", "api_elo",
             "games_played", "wins", "losses", "mvp_count", "ace_count"]
        ].copy()
        lb["win_rate"] = lb.apply(
            lambda r: f"{r['wins']/r['games_played']*100:.0f}%" if r["games_played"] > 0 else "—", axis=1
        )
        lb["tournament_elo"] = lb["tournament_elo"].round(0).astype(int)
        lb["api_elo"] = lb["api_elo"].round(0).astype(int)
        lb.index = range(1, len(lb) + 1)
        lb.index.name = "Rank"
        st.dataframe(lb, use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
#  PLAYER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════
elif page == "👥 Players":
    st.title("👥 Player Management")

    tab_add, tab_roster, tab_archive = st.tabs(["Add Player", "Active Roster", "Archived"])

    # ── Add Player ───────────────────────────────────────────────────────
    with tab_add:
        st.subheader("Add New Player")
        with st.form("add_player_form"):
            col1, col2 = st.columns(2)
            with col1:
                name = st.text_input("Real Name")
                tag = st.text_input("Riot ID (Name#Tag)", placeholder="Player#EUW")
            with col2:
                use_api = st.checkbox("Fetch rank from Riot API", value=False)
                tier = st.selectbox("Tier (manual)", list(TIER_MAP.keys()), index=3)
                div = st.selectbox("Division", list(DIVISION_MAP.keys()), index=0)

            use_avg = st.checkbox(
                "Start at current tournament average Elo (recommended for mid-season joins)",
                value=False,
            )
            submitted = st.form_submit_button("Add Player")

            if submitted and name and tag:
                api_elo = tier_to_elo(tier, div)
                if use_api:
                    rank = fetch_player_rank(tag)
                    if rank:
                        api_elo = rank["elo"]
                        st.success(f"Riot API → {rank['tier']} {rank['division']} ({rank['lp']} LP) → Elo {api_elo}")
                    else:
                        st.warning("Could not reach Riot API – using manual tier.")

                t_elo = db.get_average_tournament_elo() if use_avg else api_elo
                try:
                    pid = db.add_player(name, tag, api_elo, tournament_elo=t_elo)
                    st.success(f"✅ Added **{name}** (ID {pid}) with Elo {round(t_elo)}")
                except Exception as e:
                    st.error(f"Error: {e}")

    # ── Active Roster ────────────────────────────────────────────────────
    with tab_roster:
        st.subheader("Active Roster")
        players = db.get_all_players(active_only=True)
        if not players:
            st.info("No active players yet.")
        else:
            for p in players:
                with st.expander(f"**{p['name']}** — {p['lol_name_tag']}  |  Elo {round(p['tournament_elo'])}"):
                    cc1, cc2, cc3, cc4 = st.columns(4)
                    cc1.metric("Tournament Elo", round(p["tournament_elo"]))
                    cc2.metric("API Elo", round(p["api_elo"]))
                    cc3.metric("Games", p["games_played"])
                    wr = f"{p['wins']/p['games_played']*100:.0f}%" if p["games_played"] else "—"
                    cc4.metric("Win Rate", wr)

                    # Champion stats
                    cstats = db.get_player_champion_stats(p["id"])
                    if cstats:
                        st.caption("Champion Stats")
                        cdf = pd.DataFrame(cstats)[["champion", "picks", "wins", "losses", "bans"]]
                        cdf["win_rate"] = cdf.apply(
                            lambda r: f"{r['wins']/(r['wins']+r['losses'])*100:.0f}%"
                            if (r["wins"]+r["losses"]) > 0 else "—", axis=1
                        )
                        st.dataframe(cdf, use_container_width=True, hide_index=True)

                    # Elo history chart
                    hist = db.get_player_elo_history(p["id"])
                    if hist:
                        hdf = pd.DataFrame(hist)
                        st.line_chart(hdf.set_index("timestamp")["elo_after"])

                    if st.button(f"Archive {p['name']}", key=f"arch_{p['id']}"):
                        db.archive_player(p["id"])
                        st.rerun()

    # ── Archived ─────────────────────────────────────────────────────────
    with tab_archive:
        st.subheader("Archived Players")
        archived = db.get_all_players(active_only=False)
        archived = [p for p in archived if not p["active"]]
        if not archived:
            st.info("No archived players.")
        else:
            for p in archived:
                col1, col2 = st.columns([3, 1])
                col1.write(f"**{p['name']}** — {p['lol_name_tag']} (Elo {round(p['tournament_elo'])})")
                if col2.button("Reactivate", key=f"react_{p['id']}"):
                    db.reactivate_player(p["id"])
                    st.rerun()

# ══════════════════════════════════════════════════════════════════════════════
#  MATCHMAKING
# ══════════════════════════════════════════════════════════════════════════════
elif page == "⚔️ Matchmaking":
    st.title("⚔️ Balanced Matchmaking")

    players = db.get_all_players(active_only=True)
    if len(players) < 10:
        st.warning(f"Need at least 10 active players. Currently have {len(players)}.")
    else:
        names = {p["id"]: f"{p['name']} ({round(p['tournament_elo'])})" for p in players}
        selected_ids = st.multiselect(
            "Select 10 players for this session",
            options=[p["id"] for p in players],
            format_func=lambda x: names[x],
            max_selections=10,
        )

        if len(selected_ids) == 10:
            selected = [p for p in players if p["id"] in selected_ids]

            if st.button("🎲 Generate Balanced Teams", type="primary"):
                splits = balancer.all_splits_sorted(selected, top_n=3)
                st.session_state["splits"] = splits
                st.session_state["selected_players"] = selected

            if "splits" in st.session_state:
                for i, s in enumerate(st.session_state["splits"]):
                    st.subheader(f"Option {i+1}  —  Elo Diff: {s.elo_diff}")
                    col_b, col_r = st.columns(2)
                    with col_b:
                        st.markdown(f"<div class='team-blue'><h4>🔵 Blue Team — Avg {s.avg_blue_elo}</h4></div>",
                                    unsafe_allow_html=True)
                        for p in s.team_blue:
                            st.write(f"• {p['name']} — Elo {round(p['tournament_elo'])}")
                    with col_r:
                        st.markdown(f"<div class='team-red'><h4>🔴 Red Team — Avg {s.avg_red_elo}</h4></div>",
                                    unsafe_allow_html=True)
                        for p in s.team_red:
                            st.write(f"• {p['name']} — Elo {round(p['tournament_elo'])}")

                    if st.button(f"✅ Use Option {i+1}", key=f"use_split_{i}"):
                        st.session_state["active_split"] = s
                        st.success("Teams locked! Go to **Record Match** to finish.")
        elif selected_ids:
            st.info(f"Selected {len(selected_ids)}/10 players.")

# ══════════════════════════════════════════════════════════════════════════════
#  RECORD MATCH
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📝 Record Match":
    st.title("📝 Record Match Result")

    tab_live, tab_quick = st.tabs(["From Matchmaking", "Quick Add (Past Match)"])

    # ── helpers ───────────────────────────────────────────────────────────
    def _resolve_and_save(blue_ids, red_ids, picks_b, picks_r, bans_b, bans_r,
                          winner, mvp_id, ace_id, timestamp=None):
        """Resolve Elo, save match, update DB."""
        blue_players = [db.get_player(pid) for pid in blue_ids]
        red_players = [db.get_player(pid) for pid in red_ids]

        avg_b = sum(p["tournament_elo"] for p in blue_players) / 5
        avg_r = sum(p["tournament_elo"] for p in red_players) / 5

        results = elo_calc.resolve_match(blue_players, red_players, winner, mvp_id, ace_id)
        elo_changes = {str(r.player_id): r.delta for r in results}

        match_id = db.save_match(
            blue_ids, red_ids, avg_b, avg_r,
            picks_b, picks_r, bans_b, bans_r,
            winner, mvp_id, ace_id, elo_changes,
            timestamp=timestamp,
        )

        # Update every player
        winning_ids = blue_ids if winner == "Blue" else red_ids
        for r in results:
            db.update_player_elo(r.player_id, r.elo_after)
            db.update_player_stats(r.player_id, won=(r.player_id in winning_ids),
                                   is_mvp=r.is_mvp, is_ace=r.is_ace)
            db.save_elo_snapshot(r.player_id, match_id, r.elo_before, r.elo_after)

        # Champion stats
        all_ids = blue_ids + red_ids
        all_picks = list(zip(blue_ids, picks_b)) + list(zip(red_ids, picks_r))
        for pid, champ in all_picks:
            if champ:
                won = pid in winning_ids
                db.update_champion_stat(pid, champ, won=won, picked=True)

        for champ in bans_b + bans_r:
            if champ:
                # Bans aren't tied to a specific player; attribute to a sentinel id=0
                # We'll skip player-level ban tracking for now; global stats still work
                pass

        return match_id, results

    # ── From Matchmaking ─────────────────────────────────────────────────
    with tab_live:
        if "active_split" not in st.session_state:
            st.info("Generate teams in the **Matchmaking** tab first, or use **Quick Add**.")
        else:
            split = st.session_state["active_split"]
            blue_names = [p["name"] for p in split.team_blue]
            red_names = [p["name"] for p in split.team_red]
            blue_ids = [p["id"] for p in split.team_blue]
            red_ids = [p["id"] for p in split.team_red]

            col_b, col_r = st.columns(2)
            with col_b:
                st.markdown(f"**🔵 Blue Team** (Avg {split.avg_blue_elo})")
                picks_b = []
                for i, name in enumerate(blue_names):
                    picks_b.append(st.selectbox(f"{name}'s champion", [""] + POPULAR_CHAMPIONS,
                                                key=f"pb_{i}"))
            with col_r:
                st.markdown(f"**🔴 Red Team** (Avg {split.avg_red_elo})")
                picks_r = []
                for i, name in enumerate(red_names):
                    picks_r.append(st.selectbox(f"{name}'s champion", [""] + POPULAR_CHAMPIONS,
                                                key=f"pr_{i}"))

            st.subheader("Bans")
            bc1, bc2 = st.columns(2)
            with bc1:
                bans_b = [st.selectbox(f"Blue Ban {i+1}", [""] + POPULAR_CHAMPIONS, key=f"bb_{i}")
                          for i in range(5)]
            with bc2:
                bans_r = [st.selectbox(f"Red Ban {i+1}", [""] + POPULAR_CHAMPIONS, key=f"br_{i}")
                          for i in range(5)]

            st.divider()
            winner = st.radio("Winner", ["Blue", "Red"], horizontal=True)
            winning_team = split.team_blue if winner == "Blue" else split.team_red
            losing_team = split.team_red if winner == "Blue" else split.team_blue

            mvp_id = st.selectbox("MVP (winning team)", [p["id"] for p in winning_team],
                                  format_func=lambda x: next(p["name"] for p in winning_team if p["id"] == x))
            ace_id = st.selectbox("ACE (losing team)", [p["id"] for p in losing_team],
                                  format_func=lambda x: next(p["name"] for p in losing_team if p["id"] == x))

            if st.button("💾 Submit Match", type="primary"):
                mid, results = _resolve_and_save(
                    blue_ids, red_ids,
                    picks_b, picks_r, bans_b, bans_r,
                    winner, mvp_id, ace_id,
                )
                st.success(f"Match #{mid} recorded!")
                st.subheader("Elo Changes")
                for r in results:
                    p = db.get_player(r.player_id)
                    tag = ""
                    if r.is_mvp:
                        tag = " 🏅 MVP"
                    elif r.is_ace:
                        tag = " 🛡️ ACE"
                    color = "elo-pos" if r.delta >= 0 else "elo-neg"
                    sign = "+" if r.delta >= 0 else ""
                    st.markdown(
                        f"**{p['name']}** : {round(r.elo_before)} → {round(r.elo_after)} "
                        f"(<span class='{color}'>{sign}{r.delta}</span>){tag}",
                        unsafe_allow_html=True,
                    )
                # Clear split
                del st.session_state["active_split"]

    # ── Quick Add ────────────────────────────────────────────────────────
    with tab_quick:
        st.subheader("Quick Add Past Match")
        players = db.get_all_players(active_only=False)
        pmap = {p["id"]: f"{p['name']} ({p['lol_name_tag']})" for p in players}

        with st.form("quick_add"):
            ts = st.date_input("Match Date", value=datetime.now())
            st.markdown("**Blue Team**")
            q_blue = [
                st.selectbox(f"Blue Player {i+1}", list(pmap.keys()),
                             format_func=lambda x: pmap[x], key=f"qb_{i}")
                for i in range(5)
            ]
            q_picks_b = [
                st.selectbox(f"Blue Pick {i+1}", [""] + POPULAR_CHAMPIONS, key=f"qpb_{i}")
                for i in range(5)
            ]
            st.markdown("**Red Team**")
            q_red = [
                st.selectbox(f"Red Player {i+1}", list(pmap.keys()),
                             format_func=lambda x: pmap[x], key=f"qr_{i}")
                for i in range(5)
            ]
            q_picks_r = [
                st.selectbox(f"Red Pick {i+1}", [""] + POPULAR_CHAMPIONS, key=f"qpr_{i}")
                for i in range(5)
            ]

            st.markdown("**Bans**")
            qbc1, qbc2 = st.columns(2)
            with qbc1:
                q_bans_b = [st.selectbox(f"Blue Ban {i+1}", [""] + POPULAR_CHAMPIONS, key=f"qbb_{i}")
                            for i in range(5)]
            with qbc2:
                q_bans_r = [st.selectbox(f"Red Ban {i+1}", [""] + POPULAR_CHAMPIONS, key=f"qbr_{i}")
                            for i in range(5)]

            q_winner = st.radio("Winner", ["Blue", "Red"], horizontal=True, key="q_winner")

            all_q = q_blue + q_red
            q_winning = q_blue if q_winner == "Blue" else q_red
            q_losing = q_red if q_winner == "Blue" else q_blue
            q_mvp = st.selectbox("MVP", q_winning, format_func=lambda x: pmap[x], key="q_mvp")
            q_ace = st.selectbox("ACE", q_losing, format_func=lambda x: pmap[x], key="q_ace")

            q_sub = st.form_submit_button("Save Past Match")
            if q_sub:
                if len(set(q_blue + q_red)) != 10:
                    st.error("All 10 players must be unique.")
                else:
                    mid, results = _resolve_and_save(
                        q_blue, q_red,
                        q_picks_b, q_picks_r,
                        q_bans_b, q_bans_r,
                        q_winner, q_mvp, q_ace,
                        timestamp=ts.isoformat(),
                    )
                    st.success(f"Past match #{mid} recorded!")

# ══════════════════════════════════════════════════════════════════════════════
#  MATCH HISTORY
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📜 Match History":
    st.title("📜 Match History")

    matches = db.get_all_matches()
    if not matches:
        st.info("No matches recorded yet.")
    else:
        for m in matches:
            blue_names = [db.get_player(pid) for pid in m["team_blue"]]
            red_names = [db.get_player(pid) for pid in m["team_red"]]
            winner_label = "🔵 Blue" if m["winner"] == "Blue" else "🔴 Red"

            with st.expander(
                f"Match #{m['id']}  —  {m['timestamp'][:10]}  —  Winner: {winner_label}"
            ):
                cb, cr = st.columns(2)
                with cb:
                    st.markdown(f"**🔵 Blue Team** (Avg {round(m['avg_blue_elo'])})")
                    for i, p in enumerate(blue_names):
                        if p:
                            champ = m["picks_blue"][i] if i < len(m["picks_blue"]) else ""
                            elo_d = m["elo_changes"].get(str(p["id"]), 0)
                            sign = "+" if elo_d >= 0 else ""
                            extra = ""
                            if p["id"] == m["mvp_player_id"]:
                                extra = " 🏅"
                            elif p["id"] == m["ace_player_id"]:
                                extra = " 🛡️"
                            st.write(f"• {p['name']} ({champ}) [{sign}{round(elo_d, 1)}]{extra}")
                with cr:
                    st.markdown(f"**🔴 Red Team** (Avg {round(m['avg_red_elo'])})")
                    for i, p in enumerate(red_names):
                        if p:
                            champ = m["picks_red"][i] if i < len(m["picks_red"]) else ""
                            elo_d = m["elo_changes"].get(str(p["id"]), 0)
                            sign = "+" if elo_d >= 0 else ""
                            extra = ""
                            if p["id"] == m["mvp_player_id"]:
                                extra = " 🏅"
                            elif p["id"] == m["ace_player_id"]:
                                extra = " 🛡️"
                            st.write(f"• {p['name']} ({champ}) [{sign}{round(elo_d, 1)}]{extra}")

                if m["bans_blue"] or m["bans_red"]:
                    st.caption(f"Bans — Blue: {', '.join(b for b in m['bans_blue'] if b)} | "
                               f"Red: {', '.join(b for b in m['bans_red'] if b)}")

# ══════════════════════════════════════════════════════════════════════════════
#  STATISTICS
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📈 Statistics":
    st.title("📈 Statistics & Analytics")

    tab_global, tab_player = st.tabs(["Global Champion Stats", "Player Deep-Dive"])

    with tab_global:
        gstats = db.get_global_champion_stats()
        if not gstats:
            st.info("No champion data yet — play some matches!")
        else:
            total_picks = sum(g["total_picks"] for g in gstats)
            total_bans = sum(g["total_bans"] for g in gstats) or 1

            gdf = pd.DataFrame(gstats)
            gdf["pick_rate"] = (gdf["total_picks"] / total_picks * 100).round(1)
            gdf["ban_rate"] = (gdf["total_bans"] / total_bans * 100).round(1)
            gdf["win_rate"] = gdf.apply(
                lambda r: round(r["total_wins"] / (r["total_wins"] + r["total_losses"]) * 100, 1)
                if (r["total_wins"] + r["total_losses"]) > 0 else 0, axis=1
            )
            st.dataframe(
                gdf[["champion", "total_picks", "pick_rate", "total_bans", "ban_rate",
                     "total_wins", "total_losses", "win_rate"]],
                use_container_width=True, hide_index=True,
            )

            # Bar charts
            if len(gdf) > 0:
                st.subheader("Pick Rate (%)")
                st.bar_chart(gdf.set_index("champion")["pick_rate"].head(15))
                st.subheader("Win Rate (%)")
                st.bar_chart(gdf.set_index("champion")["win_rate"].head(15))

    with tab_player:
        players = db.get_all_players(active_only=False)
        pmap = {p["id"]: f"{p['name']} ({p['lol_name_tag']})" for p in players}
        sel = st.selectbox("Select Player", list(pmap.keys()), format_func=lambda x: pmap[x])
        if sel:
            p = db.get_player(sel)
            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("Tournament Elo", round(p["tournament_elo"]))
            c2.metric("API Elo", round(p["api_elo"]))
            c3.metric("Games", p["games_played"])
            wr = f"{p['wins']/p['games_played']*100:.0f}%" if p["games_played"] else "—"
            c4.metric("Win Rate", wr)
            c5.metric("MVPs / ACEs", f"{p['mvp_count']} / {p['ace_count']}")

            # Elo history
            hist = db.get_player_elo_history(sel)
            if hist:
                st.subheader("Elo Progression")
                hdf = pd.DataFrame(hist)
                st.line_chart(hdf.set_index("timestamp")["elo_after"])

            # Signature champions
            cstats = db.get_player_champion_stats(sel)
            if cstats:
                st.subheader("Signature Champions")
                cdf = pd.DataFrame(cstats)
                cdf["win_rate"] = cdf.apply(
                    lambda r: round(r["wins"] / (r["wins"] + r["losses"]) * 100, 1)
                    if (r["wins"] + r["losses"]) > 0 else 0, axis=1
                )
                cdf = cdf.sort_values("win_rate", ascending=False)
                st.dataframe(cdf[["champion", "picks", "wins", "losses", "win_rate"]],
                             use_container_width=True, hide_index=True)
