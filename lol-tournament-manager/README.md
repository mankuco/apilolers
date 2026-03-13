cd# LoL Internal Tournament Manager

Full-stack application (FastAPI + React) to manage 5v5 League of Legends internal tournaments for a pool of 20 recurring players.

## Features

- **Ladder** — Leaderboard with tournament Elo, API Elo, win rate, MVP/ACE badges, expandable player stats
- **Matchmaking** — Select 10 players, auto-generate the most balanced 5v5 split from 126 combinations
- **Draft & Resolution** — Editable picks/bans per team, winner selection, MVP/ACE voting, Elo recalculation
- **Match History** — Expandable cards with full detail: picks, bans, per-player Elo deltas, badges
- **Champions** — Global pick/ban/win rates, filterable per player, sortable by any stat
- **Modified Elo** — MVP bonus (+8), ACE protection (−50% loss), catch-up multiplier, zero-sum fairness

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Start both servers
./start.sh
# → Backend:  http://localhost:8000
# → Frontend: http://localhost:5173
```

Or start them separately:

```bash
# Backend
uvicorn api:app --reload --port 8000

# Frontend (in another terminal)
cd frontend && npm run dev
```

The database (SQLite) and 20 mock players are created automatically on first launch.

## Optional: Riot API Integration

```bash
export RIOT_API_KEY="RGAPI-your-key-here"
```

## Project Structure

```
lol-tournament-manager/
├── api.py              # FastAPI REST backend
├── database.py         # SQLite CRUD layer
├── elo.py              # EloCalculator (stateless, unit-testable)
├── balancer.py         # MatchBalancer (stateless, unit-testable)
├── riot_api.py         # Riot API + tier→Elo mapping
├── seed.py             # 20 mock players seeder
├── tests.py            # 18 unit tests (pytest)
├── app.py              # Legacy Streamlit UI
├── SYSTEM.md           # Full system definition with flows
├── start.sh            # Dev launcher (both servers)
└── frontend/
    ├── src/
    │   ├── api/client.js       # API client
    │   ├── hooks/useApi.js     # Data-fetching hooks
    │   ├── components/         # Reusable UI components
    │   │   ├── Layout.jsx
    │   │   ├── Sidebar.jsx
    │   │   ├── Badge.jsx
    │   │   ├── StatCard.jsx
    │   │   ├── EloChange.jsx
    │   │   ├── TeamPanel.jsx
    │   │   ├── ChampionSelect.jsx
    │   │   ├── Modal.jsx
    │   │   ├── AddPlayerModal.jsx
    │   │   └── EmptyState.jsx
    │   └── pages/
    │       ├── LadderPage.jsx
    │       ├── MatchPage.jsx
    │       ├── HistoryPage.jsx
    │       └── ChampionsPage.jsx
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
```

## Elo Formula

```
R' = R + K × (S − E) + Performance Bonus
```

- **K-Factor**: 32 (boosted to 48 with catch-up)
- **Expected Score (E)**: logistic function on average team Elo difference
- **MVP Bonus**: +8 Elo for the match MVP (winning team)
- **ACE Protection**: best player on losing team loses 50% less Elo
- **Catch-up**: ×1.5 K-factor when tournament Elo is 150+ below API Elo
