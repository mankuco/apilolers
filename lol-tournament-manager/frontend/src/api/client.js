const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Players ──────────────────────────────────────────────
export const getPlayers = (activeOnly = true) =>
  request(`/players?active_only=${activeOnly}`)

export const getPlayer = (id) => request(`/players/${id}`)

export const getPlayerStats = (id) => request(`/players/${id}/stats`)

export const getPlayerEloHistory = (id) => request(`/players/${id}/elo-history`)

export const addPlayer = (data) =>
  request('/players', { method: 'POST', body: JSON.stringify(data) })

export const riotLookup = (lolNameTag) =>
  request('/players/lookup', {
    method: 'POST',
    body: JSON.stringify({ lol_name_tag: lolNameTag }),
  })

export const archivePlayer = (id) =>
  request(`/players/${id}/archive`, { method: 'PATCH' })

export const reactivatePlayer = (id) =>
  request(`/players/${id}/reactivate`, { method: 'PATCH' })

// ── Matchmaking ──────────────────────────────────────────
export const generateTeams = (playerIds) =>
  request('/matchmaking/generate', {
    method: 'POST',
    body: JSON.stringify({ player_ids: playerIds }),
  })

// ── Matches ──────────────────────────────────────────────
export const getMatches = () => request('/matches')

export const getMatch = (id) => request(`/matches/${id}`)

export const createMatch = (data) =>
  request('/matches', { method: 'POST', body: JSON.stringify(data) })

export const createHistoricalMatch = (data) =>
  request('/matches/historical', { method: 'POST', body: JSON.stringify(data) })

export const getArchivedMatches = () => request('/matches/archived')

export const archiveMatch = (id) =>
  request(`/matches/${id}/archive`, { method: 'PATCH' })

export const restoreMatch = (id) =>
  request(`/matches/${id}/restore`, { method: 'PATCH' })

export const resolveFromRiot = (matchId, riotMatchId) =>
  request(`/matches/${matchId}/resolve-from-riot?riot_match_id=${encodeURIComponent(riotMatchId)}`, {
    method: 'POST',
  })

// ── Champions ────────────────────────────────────────────
export const getChampionStats = () => request('/champions/stats')

export const getChampionList = () => request('/champions/list')

export const getChampionCatalog = () => request('/champions/catalog')

// ── Versus ───────────────────────────────────────────────
export const getVersusStats = (idA, idB) =>
  request(`/versus/${idA}/${idB}`)

// ── Stats ────────────────────────────────────────────────
export const getOverview = () => request('/stats/overview')

export const getTiers = () => request('/tiers')

// ── Tournament ───────────────────────────────────────────
export const getTournamentConfig = () => request('/tournament/config')

export const setupTournament = (data) =>
  request('/tournament/setup', { method: 'POST', body: JSON.stringify(data) })

export const generateTournamentCode = (data) =>
  request('/tournament/codes', { method: 'POST', body: JSON.stringify(data) })

// ── Riot API Key ─────────────────────────────────────────
export const getRiotKeyStatus = () => request('/riot/key-status')

export const setRiotApiKey = (apiKey) =>
  request('/riot/key', { method: 'POST', body: JSON.stringify({ api_key: apiKey }) })

export const testRiotKey = () =>
  request('/riot/test-key', { method: 'POST' })

// ── 1v1 Duels ───────────────────────────────────────────
export const getDuelRankings = () => request('/duels/rankings')

export const getDuelMatches = () => request('/duels/matches')

export const createDuel = (data) =>
  request('/duels/matches', { method: 'POST', body: JSON.stringify(data) })

export const getDuelStats = () => request('/duels/stats')

// ── Elo Formula ──────────────────────────────────────────
export const getEloFormula = () => request('/elo/formula')
