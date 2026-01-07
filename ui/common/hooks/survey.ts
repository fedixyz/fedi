import { useCallback, useEffect, useState } from 'react'

import {
    acceptActiveSurvey,
    checkSurveyCondition,
    dismissActiveSurvey,
    selectActiveSurvey,
    selectLanguage,
    setSurveyTimestamp,
} from '../redux'
import { getSurveyLanguage } from '../utils/survey'
import { useCommonDispatch, useCommonSelector } from './redux'

export function useSurveyForm() {
    const [show, setIsShowing] = useState(false)

    const activeSurvey = useCommonSelector(selectActiveSurvey)
    const language = useCommonSelector(selectLanguage)
    const dispatch = useCommonDispatch()

    const handleDismiss = useCallback(() => {
        dispatch(dismissActiveSurvey())
        dispatch(setSurveyTimestamp(Date.now()))
        dispatch(checkSurveyCondition())
        setIsShowing(false)
    }, [dispatch])

    const handleAccept = useCallback(
        (onSuccess: (url: URL) => void) => {
            if (!activeSurvey) return

            const surveyUrl = new URL(activeSurvey.url)
            surveyUrl.searchParams.set('lang', getSurveyLanguage(language))

            dispatch(acceptActiveSurvey())
            dispatch(setSurveyTimestamp(Date.now()))
            dispatch(checkSurveyCondition())
            setIsShowing(false)

            onSuccess(surveyUrl)
        },
        [dispatch, activeSurvey, language],
    )

    useEffect(() => {
        if (activeSurvey) setIsShowing(true)
    }, [activeSurvey])

    return { show, handleDismiss, handleAccept, activeSurvey }
}
