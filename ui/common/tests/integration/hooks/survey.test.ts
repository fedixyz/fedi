import { act, waitFor } from '@testing-library/react'

import { useSurveyForm } from '../../../hooks/survey'
import { checkSurveyCondition, setSurveyTimestamp } from '../../../redux'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('useSurveyForm', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('API Endpoint enabled', () => {
        beforeEach(() => {
            mockSurveyResponse(
                JSON.stringify({
                    enabled: true,
                    url: 'https://enabled.com',
                    title: 'enabled survey title',
                    description: 'enabled survey description',
                    buttonText: 'enabled survey button text',
                    id: 'enabled-survey-id',
                }),
            )
        })

        it('should show the active and enabled survey form', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
            })
        })

        it('should not show if the user has been surveyed in the past 7 days', async () => {
            const {
                store,
                bridge: { fedimint },
            } = context

            // Set last surveyed timestamp to now
            store.dispatch(setSurveyTimestamp(Date.now()))

            await builder.withOnboardingCompleted()

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })

        it('handleDismiss should increase the number of times the survey was dismissed', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
            })

            act(() => result.current.handleDismiss())

            await waitFor(() => {
                const activeSurveyId = result.current.activeSurvey?.id ?? ''
                const completion =
                    store.getState().survey.surveyCompletions[activeSurveyId]
                expect(completion?.timesDismissed).toEqual(1)
            })
        })

        it('handleAccept should mark the active survey form as completed and not show it again', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
            })

            act(() => result.current.handleAccept(() => {}))

            await waitFor(() => {
                const activeSurveyId = result.current.activeSurvey?.id ?? ''
                const completion =
                    store.getState().survey.surveyCompletions[activeSurveyId]
                expect(completion?.isCompleted).toBeTruthy()
            })

            // After completion, reset the timestamp and try to show it again
            store.dispatch(setSurveyTimestamp(-1))
            store.dispatch(checkSurveyCondition())

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })

        it('should not show the same survey again if dismissed more than twice', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
            })

            act(() => result.current.handleDismiss())

            // Reset timestamp (simulates waiting for a week) and try to show it again
            store.dispatch(setSurveyTimestamp(-1))
            store.dispatch(checkSurveyCondition())

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
            })

            // Dismiss a second time
            act(() => result.current.handleDismiss())

            // Reset again
            store.dispatch(setSurveyTimestamp(-1))
            store.dispatch(checkSurveyCondition())

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })

        it('should show a new survey form if the ID changes, regardless of whether a previous one was completed, after a seven-day cooldown', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
                expect(result.current.activeSurvey?.id).toEqual(
                    'enabled-survey-id',
                )
            })

            act(() => result.current.handleAccept(() => {}))

            await waitFor(() => {
                const activeSurveyId = result.current.activeSurvey?.id ?? ''
                const completion =
                    store.getState().survey.surveyCompletions[activeSurveyId]
                expect(completion?.isCompleted).toBeTruthy()
            })

            // Change the survey from the server side
            mockSurveyResponse(
                JSON.stringify({
                    enabled: true,
                    url: 'https://enabled-two.com',
                    title: 'enabled survey title two',
                    description: 'enabled survey description two',
                    buttonText: 'enabled button text two',
                    id: 'enabled-survey-id-2',
                }),
            )

            // After completion, reset the timestamp and try to show it again
            store.dispatch(setSurveyTimestamp(-1))
            store.dispatch(checkSurveyCondition())

            await waitFor(() => {
                expect(result.current.show).toBeTruthy()
                expect(result.current.activeSurvey?.id).toEqual(
                    'enabled-survey-id-2',
                )
            })
        })
    })

    describe('API Endpoint not enabled', () => {
        it('should not show if the api endpoint is disabled', async () => {
            mockSurveyResponse(
                JSON.stringify({
                    enabled: false,
                    url: 'https://disabled.com',
                    title: 'disabled survey title',
                    description: 'disabled survey description',
                    buttonText: 'disabled survey button text',
                    id: 'disabled-survey-id',
                }),
            )

            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })

        it("should not show if the api endpoint doesn't match the right response schema", async () => {
            mockSurveyResponse(JSON.stringify({ foo: 'bar' }))

            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })

        it('should not show if the api endpoint returns a non-json response', async () => {
            mockSurveyResponse(
                '<!DOCTYPE html><head><title>your mom</title></head><body></body>',
                {
                    headers: { 'Content-Type': 'text/html' },
                },
            )

            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () => useSurveyForm(),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.show).toBeFalsy()
            })
        })
    })
})

const originalFetch = global.fetch

// Mocks the survey endpoint's response
function mockSurveyResponse(body: string, init: Partial<ResponseInit> = {}) {
    jest.spyOn(global, 'fetch').mockImplementation((url, options) => {
        if (typeof url === 'string' && url.includes('/api/survey')) {
            return Promise.resolve(
                new Response(body, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    ...init,
                }),
            )
        }

        // Use real fetch for everything else
        return originalFetch(url, options)
    })
}
