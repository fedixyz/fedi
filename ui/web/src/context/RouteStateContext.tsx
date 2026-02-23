/**
 * @file
 * This context allows us to push the user to routes with hidden state attached,
 * accessed via a React context. This is very similar to React-Native's
 * navigation state (https://reactnavigation.org/docs/navigation-state/)
 *
 * This had to be a custom solution since Next.js typically wants you to carry
 * state to routes in the form of query parameters for improved server side
 * rendering, but we don't want to do this for two reasons:
 *
 * 1. Some of the data here is dangerously large to be put into query parameters
 *    for fear of limits. For instance, LNURL pay can have arbitrarily sized
 *    metadata attached.
 * 2. From a privacy perspective, we do not want users accessing routes with
 *    query parameters that may provide identifying information. Including a
 *    federation id, bolt11 invoice, chat identities etc. in the query param
 *    could have it sent to the server and ending up in logs.
 *
 * This state is lost if the user manually navigates or refreshes to a page.
 */
import { useRouter } from 'next/router'
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'

import {
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedCashuEcash,
    ParsedFederationInvite,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
} from '@fedi/common/types'

import { settingsCompleteRecoveryAssistRoute } from '../constants/routes'

interface RouteStateByPath {
    '/send':
        | ParsedLnurlPay
        | ParsedBolt11
        | ParsedCashuEcash
        | ParsedBitcoinAddress
        | ParsedBip21
    '/request': ParsedLnurlWithdraw
    '/onboarding/join': ParsedFederationInvite
    [settingsCompleteRecoveryAssistRoute]: {
        recoveryId: string
        videoPath: string
    }
}

type RouteStateFn = <
    Route extends keyof RouteStateByPath,
    State extends RouteStateByPath[Route] = RouteStateByPath[Route],
>(
    route: Route,
    state: State,
) => void

const noopRouteStateFn: RouteStateFn = (_r, _s) => null
const initialState = {
    routeState: undefined as
        | RouteStateByPath[keyof RouteStateByPath]
        | undefined,
    pushWithState: noopRouteStateFn,
    replaceWithState: noopRouteStateFn,
}

export const RouteStateContext = createContext(initialState)

interface Props {
    children: React.ReactNode
}

export const RouteStateProvider: React.FC<Props> = ({ children }) => {
    const { push, replace, pathname } = useRouter()
    const [routeState, setRouteState] = useState(initialState.routeState)
    const routePathnameRef = useRef<string | undefined>(undefined)

    // Reset route state when we navigate away
    useEffect(() => {
        if (routePathnameRef.current && pathname !== routePathnameRef.current) {
            setRouteState(undefined)
            routePathnameRef.current = undefined
        }
    }, [pathname])

    const pushWithState: RouteStateFn = useCallback(
        (route, state) => {
            routePathnameRef.current = route
            setRouteState(state)
            push(route)
        },
        [push],
    )

    const replaceWithState: RouteStateFn = useCallback(
        (route, state) => {
            routePathnameRef.current = route
            setRouteState(state)
            replace(route)
        },
        [replace],
    )

    return (
        <RouteStateContext.Provider
            value={{
                routeState,
                pushWithState,
                replaceWithState,
            }}>
            {children}
        </RouteStateContext.Provider>
    )
}

export const useRouteStateContext = () => useContext(RouteStateContext)

export const useRouteState = <Route extends keyof RouteStateByPath>(
    _: Route,
): RouteStateByPath[Route] | undefined => {
    const { routeState } = useContext(RouteStateContext)
    return routeState as RouteStateByPath[Route] | undefined
}
