import React, { useCallback, useEffect, useRef, useState } from 'react'

import { InjectionMessageType as T } from '@fedi/injections/src/types'

import { styled, theme } from '../../styles'
import { ApiCard } from './ApiCard'
import { ApiDef, Custom, LogEntry, apis, resolveData } from './apis'
import { dispatch } from './dispatch'

const sectionTitles = ['WebLN (Lightning)', 'Nostr (NIP-07)', 'Fedi Internal']

const sectionFor = (t: T): string =>
    t.startsWith('webln_')
        ? 'WebLN (Lightning)'
        : t.startsWith('nostr_')
          ? 'Nostr (NIP-07)'
          : 'Fedi Internal'

const iconFor = (title: string): string =>
    title.startsWith('WebLN') ? '⚡' : title.startsWith('Nostr') ? '🔑' : '🛡️'

const nowTime = () =>
    new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })

const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n) + '...' : s

interface Providers {
    webln: boolean
    nostr: boolean
    fedi: boolean
    bridge: boolean
}

const detectProviders = (): Providers => {
    if (typeof window === 'undefined')
        return { webln: false, nostr: false, fedi: false, bridge: false }
    return {
        webln: 'webln' in window,
        nostr: 'nostr' in window,
        fedi: 'fediInternal' in window,
        bridge: 'ReactNativeWebView' in window,
    }
}

export const MiniappApiDebugger: React.FC = () => {
    const [providers, setProviders] = useState<Providers>({
        webln: false,
        nostr: false,
        fedi: false,
        bridge: false,
    })
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [custom, setCustom] = useState<Custom>({})
    const [openSections, setOpenSections] = useState<Record<string, boolean>>(
        Object.fromEntries(sectionTitles.map(t => [t, true])),
    )
    const [guideOpen, setGuideOpen] = useState(false)
    const logIdRef = useRef(0)
    const logListRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const check = () =>
            setProviders(prev => {
                const next = detectProviders()
                return prev.webln === next.webln &&
                    prev.nostr === next.nostr &&
                    prev.fedi === next.fedi &&
                    prev.bridge === next.bridge
                    ? prev
                    : next
            })
        check()
        const interval = setInterval(check, 1000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        const el = logListRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [logs])

    const onCustomChange = useCallback((key: string, value: string) => {
        setCustom(prev => ({ ...prev, [key]: value }))
    }, [])

    const onCall = useCallback(
        async (api: ApiDef, variantIdx: number) => {
            const variant = api.variants[variantIdx]
            const entryId = ++logIdRef.current
            setLogs(prev => [
                ...prev,
                {
                    id: entryId,
                    timestamp: nowTime(),
                    api: `${api.type} [${variant.label}]`,
                    status: 'pending',
                },
            ])
            const update = (patch: Partial<LogEntry>) =>
                setLogs(prev =>
                    prev.map(l => (l.id === entryId ? { ...l, ...patch } : l)),
                )
            try {
                const data = resolveData(variant.data, custom)
                const response = await dispatch(api.type, data)
                update({
                    status: 'success',
                    response:
                        response === undefined
                            ? '(void - no return value)'
                            : response,
                })
            } catch (err) {
                update({
                    status: 'error',
                    error: err instanceof Error ? err.message : String(err),
                })
            }
        },
        [custom],
    )

    const getLast = useCallback(
        (type: T) => {
            for (let i = logs.length - 1; i >= 0; i--) {
                if (logs[i].api.startsWith(type + ' ')) return logs[i]
            }
            return undefined
        },
        [logs],
    )

    const toggleSection = (title: string) =>
        setOpenSections(prev => ({ ...prev, [title]: !prev[title] }))

    return (
        <Page>
            <Content>
                <Header>
                    <Title>MiniApp API Debug Tool</Title>
                    <Subtitle>
                        Test and debug all Fedi miniapp injection APIs
                    </Subtitle>
                </Header>

                <GuideBanner>
                    <GuideToggle
                        type="button"
                        onClick={() => setGuideOpen(v => !v)}>
                        <GuideTitle>How to use this tool</GuideTitle>
                        <Caret>{guideOpen ? '▲' : '▼'}</Caret>
                    </GuideToggle>
                    {guideOpen && (
                        <GuideBody>
                            <ol>
                                <li>Open the Fedi app on your device</li>
                                <li>
                                    Navigate to the miniapp browser (via a
                                    community or the mod browser)
                                </li>
                                <li>
                                    Add this page&apos;s URL as a custom miniapp
                                </li>
                                <li>
                                    The badges below turn green when the
                                    injected providers are detected on window
                                </li>
                                <li>
                                    Tap any button to trigger an API call -
                                    results appear inline and in the log at the
                                    bottom
                                </li>
                            </ol>
                            <GuideNote>
                                Buttons with input fields use sensible defaults.
                                Edit fields to test with your own values.
                            </GuideNote>
                        </GuideBody>
                    )}
                </GuideBanner>

                <ProviderRow>
                    <Badge ok={providers.webln}>
                        {providers.webln ? '✅' : '❌'} webln
                    </Badge>
                    <Badge ok={providers.nostr}>
                        {providers.nostr ? '✅' : '❌'} nostr
                    </Badge>
                    <Badge ok={providers.fedi}>
                        {providers.fedi ? '✅' : '❌'} fediInternal
                    </Badge>
                </ProviderRow>

                {!providers.bridge && (
                    <WarningBanner>
                        No native bridge detected. This tool must be opened
                        inside the Fedi app&apos;s miniapp browser for the APIs
                        to be available.
                    </WarningBanner>
                )}

                {sectionTitles.map(title => {
                    const open = openSections[title]
                    const sectionApis = apis.filter(
                        a => sectionFor(a.type) === title,
                    )
                    return (
                        <SectionBox key={title}>
                            <SectionHead onClick={() => toggleSection(title)}>
                                <SectionTitle>
                                    <span>{iconFor(title)}</span>
                                    {title}
                                </SectionTitle>
                                <Caret>{open ? '▲' : '▼'}</Caret>
                            </SectionHead>
                            {open && (
                                <CardGrid>
                                    {sectionApis.map(api => (
                                        <ApiCard
                                            key={api.type}
                                            api={api}
                                            custom={custom}
                                            onCustomChange={onCustomChange}
                                            onCall={onCall}
                                            last={getLast(api.type)}
                                        />
                                    ))}
                                </CardGrid>
                            )}
                        </SectionBox>
                    )
                })}

                {logs.length > 0 && (
                    <LogSection>
                        <LogHead>
                            <strong>Response Log ({logs.length})</strong>
                            <ClearButton onClick={() => setLogs([])}>
                                Clear
                            </ClearButton>
                        </LogHead>
                        <LogList ref={logListRef}>
                            {logs.map(e => (
                                <LogItem key={e.id} status={e.status}>
                                    <LogTime>{e.timestamp}</LogTime>
                                    <LogApi>{e.api}</LogApi>
                                    <LogStatus status={e.status}>
                                        {e.status === 'pending'
                                            ? '⏳ pending...'
                                            : e.status === 'success'
                                              ? '✅ ' +
                                                truncate(
                                                    JSON.stringify(e.response),
                                                    120,
                                                )
                                              : '❌ ' + (e.error || 'Error')}
                                    </LogStatus>
                                </LogItem>
                            ))}
                        </LogList>
                    </LogSection>
                )}
            </Content>
        </Page>
    )
}

const Page = styled('div', {
    width: '100%',
    height: '100dvh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
})
const Content = styled('div', {
    maxWidth: 600,
    margin: '0 auto',
    padding: 16,
    paddingBottom: 100,
    fontFamily: theme.fonts.body,
    color: theme.colors.darkGrey,
    boxSizing: 'border-box',
})
const Header = styled('div', { textAlign: 'center', marginBottom: 16 })
const Title = styled('h1', {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 4px',
    color: theme.colors.primary,
})
const Subtitle = styled('p', {
    fontSize: 14,
    margin: 0,
    color: theme.colors.grey,
})

const GuideBanner = styled('div', {
    background: theme.colors.primary05,
    border: `1px solid ${theme.colors.primary20}`,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
})
const GuideToggle = styled('button', {
    width: '100%',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    textAlign: 'left',
})
const GuideTitle = styled('div', {
    fontWeight: 600,
    fontSize: 14,
    color: theme.colors.primary,
})
const GuideBody = styled('div', {
    padding: '0 16px 14px',
    fontSize: 13,
    lineHeight: 1.6,
    color: theme.colors.darkGrey,
    '& ol': { margin: '0 0 8px', paddingLeft: 20 },
})
const GuideNote = styled('div', {
    fontSize: 12,
    color: theme.colors.grey,
    fontStyle: 'italic',
})

const ProviderRow = styled('div', {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
})
const Badge = styled('div', {
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: 20,
    flex: 1,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    variants: {
        ok: {
            true: { background: '#dcfce7', color: '#166534' },
            false: { background: '#fef2f2', color: '#991b1b' },
        },
    },
})

const WarningBanner = styled('div', {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: '#92400e',
    marginBottom: 16,
    lineHeight: 1.5,
})

const SectionBox = styled('div', {
    marginBottom: 12,
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: 12,
    overflow: 'hidden',
})
const SectionHead = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    background: theme.colors.white,
    '&:hover': { background: theme.colors.grey50 },
})
const SectionTitle = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 600,
    fontSize: 16,
})
const Caret = styled('span', { fontSize: 12, color: theme.colors.grey })

const CardGrid = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '0 12px 12px',
})

const LogSection = styled('div', {
    marginTop: 24,
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: 12,
    overflow: 'hidden',
})
const LogHead = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: theme.colors.grey50,
    borderBottom: `1px solid ${theme.colors.lightGrey}`,
    fontSize: 14,
})
const ClearButton = styled('button', {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${theme.colors.lightGrey}`,
    background: theme.colors.white,
    cursor: 'pointer',
    color: theme.colors.grey,
    '&:hover': { background: theme.colors.grey100 },
})
const LogList = styled('div', {
    maxHeight: 400,
    overflowY: 'auto',
    padding: '8px 0',
})
const LogItem = styled('div', {
    padding: '6px 14px',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderBottom: `1px solid ${theme.colors.grey100}`,
    '&:last-of-type': { borderBottom: 'none' },
    variants: {
        status: {
            pending: { opacity: 0.6 },
            success: {},
            error: {},
        },
    },
})
const LogTime = styled('span', {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    color: theme.colors.grey,
})
const LogApi = styled('span', { fontWeight: 500, fontSize: 12 })
const LogStatus = styled('span', {
    fontSize: 11,
    fontFamily: theme.fonts.mono,
    wordBreak: 'break-all',
    variants: {
        status: {
            pending: { color: theme.colors.grey },
            success: { color: '#166534' },
            error: { color: '#991b1b' },
        },
    },
})
