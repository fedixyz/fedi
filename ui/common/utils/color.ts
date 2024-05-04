const IDENTITY_COLOR_PAIRS: [string, string][] = [
    ['#FFCDD2', '#D32F2F'], // Red
    ['#F8BBD0', '#C2185B'], // Pink
    ['#E1BEE7', '#7B1FA2'], // Purple
    ['#D1C4E9', '#512DA8'], // Deep Purple
    ['#C5CAE9', '#303F9F'], // Indigo
    ['#BBDEFB', '#1976D2'], // Blue
    ['#B3E5FC', '#0288D1'], // Light Blue
    ['#B2EBF2', '#0097A7'], // Cyan
    ['#B2DFDB', '#00796B'], // Teal
    ['#C8E6C9', '#388E3C'], // Green
    ['#DCEDC8', '#689F38'], // Light Green
    ['#F0F4C3', '#AFB42B'], // Lime
    ['#FFF9C4', '#FBC02D'], // Yellow
    ['#FFECB3', '#FFA000'], // Amber
    ['#FFE0B2', '#F57C00'], // Orange
    ['#FFCCBC', '#E64A19'], // Deep Orange
    ['#D7CCC8', '#5D4037'], // Brown
    ['#F5F5F5', '#616161'], // Grey
    ['#CFD8DC', '#455A64'], // Blue Grey
]

export function getIdentityColors(id: string | number) {
    id = id.toString()
    let index = 0
    for (let i = 0; i < id.length; i++) {
        index += id.charCodeAt(i)
    }
    return IDENTITY_COLOR_PAIRS[index % IDENTITY_COLOR_PAIRS.length]
}

/**
 * Given a 6 character hex string and an opacity, convert it to an rgba value.
 * Opacity must be number from 0 to 1. Hex must be 6 char, not shortened 3 char
 * or alpha'd 8 char.
 */
export function hexToRgba(hex: string, alpha: number) {
    hex = hex.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
