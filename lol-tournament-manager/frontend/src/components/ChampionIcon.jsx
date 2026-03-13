import { useState } from 'react'

/**
 * Champion icon using Data Dragon.
 * championId can be either:
 *   - The Data Dragon key (e.g. "Aatrox", "MonkeyKing")
 *   - The display name (e.g. "Aatrox", "Wukong")
 *
 * We try the name directly first; if that fails we strip special chars.
 */

const DDRAGON_VERSION = '14.24.1'

function champNameToId(name) {
  if (!name) return ''
  // Common special cases
  const SPECIAL = {
    "Wukong": "MonkeyKing",
    "Renata Glasc": "Renata",
    "Nunu & Willump": "Nunu",
    "Cho'Gath": "Chogath",
    "Vel'Koz": "Velkoz",
    "Kha'Zix": "Khazix",
    "Kai'Sa": "Kaisa",
    "Kog'Maw": "KogMaw",
    "Rek'Sai": "RekSai",
    "Bel'Veth": "Belveth",
    "K'Sante": "KSante",
  }
  if (SPECIAL[name]) return SPECIAL[name]
  // Remove spaces, apostrophes, dots, ampersands
  return name.replace(/[\s'.&]/g, '')
}

function getChampionImageUrl(name) {
  if (!name) return null
  const id = champNameToId(name)
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${id}.png`
}

export function getChampionSquareUrl(name) {
  return getChampionImageUrl(name)
}

export default function ChampionIcon({ name, size = 20, className = '' }) {
  const [error, setError] = useState(false)
  const url = getChampionImageUrl(name)

  if (!name || !url || error) {
    return (
      <div
        className={`rounded bg-surface-700 flex items-center justify-center text-surface-500 shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        ?
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={`rounded shrink-0 ${className}`}
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}
