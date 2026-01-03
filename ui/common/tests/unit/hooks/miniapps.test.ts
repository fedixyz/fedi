import { act, waitFor } from '@testing-library/react'
import fetchMock from 'jest-fetch-mock'
import { rest } from 'msw'
import { setupServer } from 'msw/node'

import useValidateMiniAppUrl, {
    DEBOUNCE_MS,
    MAX_TITLE_LENGTH,
    MIN_TITLE_LENGTH,
} from '../../../hooks/miniapps'
import { renderHookWithState } from '../../utils/render'

fetchMock.enableMocks()

// Only mock endpoints needed for hook-specific logic
// (metadata extraction edge cases are tested in fedimods.test.ts)
const testAppUrl = 'https://test-app.com'
const sanitizeTestUrl = 'https://sanitize-test.com'
const errorUrl = 'https://error.com'
const noProtocolUrl = 'example.com'

const server = setupServer(
    rest.get(testAppUrl, (_req, res, ctx) => {
        return res(
            ctx.status(200),
            ctx.set('Content-Type', 'text/html'),
            ctx.body(
                '<head><title>Test App</title><link rel="icon" href="/icon.png"></head>',
            ),
        )
    }),
    rest.get(`${testAppUrl}/icon.png`, (_req, res, ctx) => {
        return res(
            ctx.status(200),
            ctx.set('Content-Type', 'image/png'),
            ctx.body(''),
        )
    }),

    rest.get(sanitizeTestUrl, (_req, res, ctx) => {
        return res(
            ctx.status(200),
            ctx.set('Content-Type', 'text/html'),
            ctx.body('<head><title>Example - Log In or Sign Up</title></head>'),
        )
    }),
    rest.get(`${sanitizeTestUrl}/favicon.ico`, (_req, res, ctx) => {
        return res(ctx.status(404))
    }),

    rest.get(errorUrl, (_req, res, _ctx) => {
        return res.networkError('Failed to fetch')
    }),

    rest.get(`https://${noProtocolUrl}`, (_req, res, ctx) => {
        return res(
            ctx.status(200),
            ctx.set('Content-Type', 'text/html'),
            ctx.body(
                '<head><title>Example Site</title><link rel="icon" href="/icon.png"></head>',
            ),
        )
    }),
    rest.get(`https://${noProtocolUrl}/icon.png`, (_req, res, ctx) => {
        return res(
            ctx.status(200),
            ctx.set('Content-Type', 'image/png'),
            ctx.body(''),
        )
    }),
)

describe('useValidateMiniAppUrl', () => {
    beforeAll(() => server.listen())
    afterEach(() => {
        server.resetHandlers()
        jest.clearAllTimers()
        jest.useRealTimers()
    })
    afterAll(() => server.close())

    describe('debouncing behavior', () => {
        it(`should wait ${DEBOUNCE_MS}ms for typing to stop before fetching website info`, async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })
            expect(result.current.isFetching).toBe(false)

            // Wait for less than debounce to make sure no fetch happens
            // then wait a bit longer to make sure the fetch happens
            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS - 50)
            })
            expect(result.current.isFetching).toBe(false)
            act(() => {
                jest.advanceTimersByTime(100)
            })
            await waitFor(() => {
                expect(result.current.isFetching).toBe(true)
            })
        })

        it('should avoid excessive server requests during rapid input', async () => {
            jest.useFakeTimers()
            let fetchCount = 0

            server.use(
                rest.get('https://url1.com', (_req, res, ctx) => {
                    fetchCount++
                    return res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'text/html'),
                        ctx.body('<head><title>URL 1</title></head>'),
                    )
                }),
                rest.get('https://url1.com/favicon.ico', (_req, res, ctx) => {
                    return res(ctx.status(404))
                }),
                rest.get('https://url2.com', (_req, res, ctx) => {
                    fetchCount++
                    return res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'text/html'),
                        ctx.body('<head><title>URL 2</title></head>'),
                    )
                }),
                rest.get('https://url2.com/favicon.ico', (_req, res, ctx) => {
                    return res(ctx.status(404))
                }),
                rest.get('https://url3.com', (_req, res, ctx) => {
                    fetchCount++
                    return res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'text/html'),
                        ctx.body('<head><title>URL 3</title></head>'),
                    )
                }),
                rest.get('https://url3.com/favicon.ico', (_req, res, ctx) => {
                    return res(ctx.status(404))
                }),
            )

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl('https://url1.com')
            })
            act(() => {
                jest.advanceTimersByTime(100)
            })
            act(() => {
                result.current.setUrl('https://url2.com')
            })
            act(() => {
                jest.advanceTimersByTime(100)
            })
            act(() => {
                result.current.setUrl('https://url3.com')
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('URL 3')
            })

            expect(fetchCount).toBe(1)
        })
    })

    describe('URL validation and normalization', () => {
        it('should automatically handle URLs without https:// prefix', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(noProtocolUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('Example Site')
            })
        })

        it('should accept full URLs with https:// prefix', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('Test App')
            })
        })

        it('should reject invalid URLs', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl('not a valid url!!!')
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            expect(result.current.isFetching).toBe(false)
            expect(result.current.canSave).toBe(false)
        })
    })

    describe('state management', () => {
        it('should auto-populate title and icon from website metadata with loading states', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            expect(result.current.isFetching).toBe(false)

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            expect(result.current.isFetching).toBe(false)

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(true)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('Test App')
                expect(result.current.imageUrl).toBe(`${testAppUrl}/icon.png`)
            })
        })

        it('should handle unreachable websites gracefully', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(errorUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(true)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            expect(result.current.title).toBe('')
        })
    })

    describe('manual overrides', () => {
        it('should allow overwriting the auto-populated title', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('Test App')
            })

            act(() => {
                result.current.setTitle('Custom Title')
            })

            expect(result.current.title).toBe('Custom Title')
        })

        it('should allow overwriting the auto-populated icon URL', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            act(() => {
                result.current.setImageUrl('https://custom.com/icon.png')
            })

            expect(result.current.imageUrl).toBe('https://custom.com/icon.png')
        })
    })

    describe('canSave validation', () => {
        it('should enable saving when all fields are valid', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.title).toBe('Test App')
            })

            expect(result.current.canSave).toBe(true)
        })

        it('should not block saving on slow connections', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                result.current.setTitle('My App')
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(true)
            })

            expect(result.current.canSave).toBe(true)
        })

        it('should require a valid URL to save', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl('not valid!!!')
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            expect(result.current.isFetching).toBe(false)
            expect(result.current.canSave).toBe(false)
        })

        it('should require a title to save', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            act(() => {
                result.current.setTitle('')
            })

            expect(result.current.canSave).toBeFalsy()
        })

        it(`should require the title to be between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters`, async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(testAppUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            act(() => {
                result.current.setTitle('a'.repeat(MIN_TITLE_LENGTH - 1))
            })
            expect(result.current.canSave).toBe(false)

            act(() => {
                result.current.setTitle('a'.repeat(MIN_TITLE_LENGTH))
            })
            expect(result.current.canSave).toBe(true)

            act(() => {
                result.current.setTitle('a'.repeat(MAX_TITLE_LENGTH))
            })
            expect(result.current.canSave).toBe(true)

            act(() => {
                result.current.setTitle('a'.repeat(MAX_TITLE_LENGTH + 1))
            })
            expect(result.current.canSave).toBe(false)
        })
    })

    describe('title sanitization', () => {
        it('should trim titles with too much text', async () => {
            jest.useFakeTimers()

            const { result } = renderHookWithState(() =>
                useValidateMiniAppUrl(),
            )

            act(() => {
                result.current.setUrl(sanitizeTestUrl)
            })

            act(() => {
                jest.advanceTimersByTime(DEBOUNCE_MS)
            })

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            expect(result.current.title).toBe('Example')
        })
    })
})
