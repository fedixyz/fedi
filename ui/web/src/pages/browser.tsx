import { useRouter } from 'next/router'
import React, { useEffect } from 'react'

import { setCurrentUrl } from '@fedi/common/redux/browser'

import { Redirect } from '../components/Redirect'
import { homeRoute } from '../constants/routes'
import { useAppDispatch } from '../hooks'
import { getHashParams } from '../utils/linking'

const BrowserPage: React.FC = () => {
    const dispatch = useAppDispatch()
    const { query } = useRouter()

    useEffect(() => {
        const hashUrl = getHashParams(window.location.hash).url
        const queryUrl =
            typeof query.url === 'string'
                ? query.url
                : typeof query.id === 'string'
                  ? query.id
                  : undefined
        const url = hashUrl || queryUrl

        if (url) {
            dispatch(setCurrentUrl({ url }))
        }
    }, [dispatch, query.id, query.url])

    return <Redirect path={homeRoute} />
}

export default BrowserPage
