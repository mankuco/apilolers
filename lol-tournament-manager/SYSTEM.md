# LoL Internal Tournament Manager — System Definition

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend (Vite)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │  Ladder  │ │  Match   │ │ History  │ │ Champions  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘ │
│       └─────────────┴────────────┴─────────────┘        │
│                         │ REST API calls                │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│               FastAPI Backend (:8000)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ EloCalculator│ │ MatchBalancer│ │  Riot API Client │ │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘ │
│         └────────────────┴──────────────────┘           │
│                          │                              │
│                   ┌──────┴───────┐                      │
│                   │   SQLite DB  │                      │
│                   └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## 2. Data Models

### Player
| Field            | Type    | Description                                    |
|------------------|---------|------------------------------------------------|
| id               | int     | Auto-increment PK                              |
| name             | string  | Real name                                      |
| lol_name_tag     | string  | Riot ID (e.g. "User#EUW"), unique              |
| api_elo          | float   | Numeric rank from Riot API                     |
| tournament_elo   | float   | Internal rating (starts from api_elo)          |
| games_played     | int     | Total matches                                  |
| wins / losses    | int     | W/L counters                                   |
| mvp_count        | int     | Times awarded MVP                              |
| ace_count        | int     | Times awarded ACE                              |
| active           | bool    | Soft-delete flag                               |

### Match
| Field            | Type       | Description                                 |
|------------------|------------|---------------------------------------------|
| id               | int        | Auto-increment PK                           |
| timestamp        | datetime   | When the match was played                   |
| team_blue/red    | int[]      | Player IDs per team                         |
| avg_blue/red_elo | float      | Average team Elo at match time              |
| picks_blue/red   | string[]   | Champion names (5 per team)                 |
| bans_blue/red    | string[]   | Champion names (5 per team)                 |
| winner           | "Blue"/"Red" | Winning side                              |
| mvp_player_id    | int?       | FK to players (winning team)                |
| ace_player_id    | int?       | FK to players (losing team)                 |
| elo_changes      | object     | {player_id: delta} snapshot                 |

### Champion Stats (per player)
| Field    | Type   | Description              |
|----------|--------|--------------------------|
| champion | string | Champion name            |
| picks    | int    | Times picked             |
| wins     | int    | Wins on this champion    |
| losses   | int    | Losses on this champion  |
| bans     | int    | Times banned             |

## 3. Core Flows

### Flow A — Add Player

```
User inputs name + Riot ID
         │
         ▼
┌─────────────────────┐    ┌──────────────────┐
│ POST /api/players   │───▶│ Riot API lookup   │
│                     │    │ (tier → numeric)  │
└─────────┬───────────┘    └──────────┬───────┘
          │                           │
          │    ◄── api_elo ───────────┘
          ▼
┌─────────────────────────────────────┐
│ If tournament ongoing:              │
│   tournament_elo = AVG(all players) │
│ Else:                               │
│   tournament_elo = api_elo          │
└─────────────────┬───────────────────┘
                  ▼
           Player saved to DB
```

### Flow B — Create Match (Matchmaking)

```
Admin selects 10 players from pool
              │
              ▼
┌──────────────────────────────────────┐
│ MatchBalancer generates all C(10,5)/2│
│ = 126 unique team combinations       │
│                                      │
│ Ranks by |avg_elo_A - avg_elo_B|     │
│ Returns top 3 most balanced splits   │
└──────────────┬───────────────────────┘
               ▼
     Admin picks a split
               │
               ▼
┌──────────────────────────────┐
│ Champion Select Phase:       │
│  • 5 picks per team          │
│  • 5 bans per team           │
│  (editable dropdowns)        │
└──────────────┬───────────────┘
               ▼
       Match created (pending)
```

### Flow C — Resolve Match

```
Match is in "pending" state
              │
              ▼
┌─────────────────────────────────┐
│ Admin selects:                  │
│  1. Winner (Blue / Red)         │
│  2. MVP (from winning team)     │
│  3. ACE (from losing team)      │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────────────────┐
│ EloCalculator.resolve_match()               │
│                                             │
│ For each player:                            │
│   E = 1 / (1 + 10^((opp_avg - team_avg)/400))│
│   delta = K × (S - E)                      │
│                                             │
│   if MVP:  delta += 8                       │
│   if ACE:  delta × 0.5 (reduced loss)      │
│   if catch-up: K × 1.5                     │
└──────────────┬──────────────────────────────┘
               ▼
┌─────────────────────────────────┐
│ Update per player:              │
│  • tournament_elo               │
│  • wins / losses / games_played │
│  • mvp_count / ace_count        │
│  • champion win/loss/pick stats │
│  • elo_history snapshot         │
└─────────────────────────────────┘
```

## 4. Frontend Pages

### 🏆 Ladder
- Table sorted by `tournament_elo` DESC
- Columns: Rank, Name, Riot ID, Tournament Elo, API Elo, Games, Win Rate, MVP/ACE badges
- "New Match" button opens the match creation flow
- Click a player row → expands inline stats

### ⚔️ Match (Create & Resolve)
- **Step 1 — Select**: Pick 10 players from dropdown/checkboxes
- **Step 2 — Balance**: Auto-generate top 3 balanced splits, admin chooses one
- **Step 3 — Draft**: Editable pick/ban slots per team, shown side-by-side
- **Step 4 — Resolve**: Select winner → vote MVP/ACE → submit
- Shows Elo delta preview before confirming

### 📜 History
- Reverse-chronological list of match cards
- Each card shows: date, winner badge, teams side-by-side
- Expandable detail: full picks/bans, per-player Elo delta with +/- coloring, MVP/ACE badges

### 🎮 Champions
- Global table: Champion, Pick Count, Pick Rate %, Ban Count, Ban Rate %, Win Rate %
- Sortable columns (click header)
- Player filter dropdown → shows that player's personal champion stats
- Bar chart visualization for top picked/banned/winrate

## 5. Component Architecture

```
App
├── Layout
│   ├── Sidebar (nav links + branding)
│   └── <Outlet /> (page content)
│
├── Pages
│   ├── LadderPage
│   │   ├── StatCard (x4 KPIs)
│   │   ├── PlayerTable
│   │   │   └── PlayerRow (with inline expand)
│   │   │       ├── Badge (MVP / ACE)
│   │   │       └── EloChange
│   │   └── Button → "New Match"
│   │
│   ├── MatchPage
│   │   ├── PlayerSelector (multi-select with search)
│   │   ├── TeamPanel (Blue) ←→ TeamPanel (Red)
│   │   │   ├── PlayerCard (with champion dropdown)
│   │   │   └── BanSlot (x5)
│   │   ├── MatchResolver
│   │   │   ├── WinnerToggle
│   │   │   ├── MvpSelector
│   │   │   └── AceSelector
│   │   └── EloPreview (delta table)
│   │
│   ├── HistoryPage
│   │   └── MatchCard (expandable)
│   │       ├── TeamPanel (readonly)
│   │       ├── EloChange (per player)
│   │       └── Badge (MVP / ACE)
│   │
│   ├── ChampionsPage
│   │   ├── PlayerFilter (dropdown)
│   │   ├── ChampionTable (sortable)
│   │   └── ChampionChart (bar)
│   │
│   └── AddPlayerModal
│       ├── TextInput (name, riot ID)
│       ├── ApiStatusIndicator
│       └── EloPreview
│
└── Shared Components
    ├── Badge           → MVP / ACE / Rank tier icon
    ├── StatCard        → Metric card with label + value
    ├── EloChange       → Colored +/- delta display
    ├── PlayerCard      → Avatar + name + elo compact
    ├── TeamPanel       → 5 player slots + avg elo
    ├── Modal           → Generic overlay container
    ├── SearchInput     → Filterable input with suggestions
    ├── ChampionSelect  → Searchable champion dropdown
    ├── Tooltip         → Hover info
    └── EmptyState      → Placeholder when no data
```

## 6. API Endpoints (FastAPI)

| Method | Endpoint                        | Description                          |
|--------|---------------------------------|--------------------------------------|
| GET    | /api/players                    | List all players (active by default) |
| POST   | /api/players                    | Add player (with optional API lookup)|
| PATCH  | /api/players/{id}/archive       | Soft-delete player                   |
| PATCH  | /api/players/{id}/reactivate    | Restore archived player              |
| GET    | /api/players/{id}/stats         | Player champion stats + elo history  |
| GET    | /api/players/{id}/elo-history   | Elo progression data                 |
| POST   | /api/matchmaking/generate       | Generate balanced teams from 10 IDs  |
| GET    | /api/matches                    | List all matches                     |
| POST   | /api/matches                    | Create + resolve a match             |
| GET    | /api/champions/stats            | Global champion statistics           |
| GET    | /api/champions/list             | Available champion names             |
| GET    | /api/stats/overview             | Dashboard KPIs                       |

## 7. Elo Fairness Guarantees

1. **Zero-sum in even matches** — When teams are equal, winner gains ≈ loser loses
2. **Underdog compensation** — Lower-rated team gains disproportionately more on upset
3. **MVP reward** — Recognizes individual excellence on winning side (+8 Elo)
4. **ACE protection** — Prevents skill decay for strong players on weak teams (−50% loss)
5. **Catch-up mechanic** — New/returning players converge to true skill faster (×1.5 K)
6. **Mid-season entry** — New players start at current pool average to prevent inflation
