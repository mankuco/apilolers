import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LadderPage from './pages/LadderPage'
import MatchPage from './pages/MatchPage'
import VersusPage from './pages/VersusPage'
import HistoryPage from './pages/HistoryPage'
import ChampionsPage from './pages/ChampionsPage'
import DuelPage from './pages/DuelPage'
import SeasonsPage from './pages/SeasonsPage'
import TournamentPage from './pages/TournamentPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/ladder" replace />} />
        <Route path="ladder" element={<LadderPage />} />
        <Route path="match" element={<MatchPage />} />
        <Route path="versus" element={<VersusPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="champions" element={<ChampionsPage />} />
        <Route path="duels" element={<DuelPage />} />
        <Route path="seasons" element={<SeasonsPage />} />
        <Route path="tournament" element={<TournamentPage />} />
      </Route>
    </Routes>
  )
}
