export type ScreenConfig =
    | string
    | {
          path?: string
          screens?: Record<string, ScreenConfig>
      }

export type ParsedDeepLink = {
    screen: string
    id?: string
    isValid: boolean
    originalUrl: string
    fediUrl?: string
}

export interface NavigationParams {
    roomId?: string
    userId?: string
    screen?: string
    ticketNumber?: string
    params?: NavigationParams
    [key: string]: string | number | boolean | undefined | NavigationParams
}

export interface NavigationAction {
    type: 'navigate'
    screen: string
    params?: NavigationParams
}
