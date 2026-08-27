import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    useAppliedGuardianFeePpm,
    useWalletServiceFederationId,
    useWalletServiceLightningAttach,
    useWalletServiceMetadata,
} from '@fedi/common/hooks/fi'
import { useToast } from '@fedi/common/hooks/toast'
import {
    DEFAULT_GUARDIAN_FEE_PPM,
    getWalletServiceErrorKey,
    getWalletServiceRetryableError,
    guardianFeePpmToPercent,
    selectFiFormation,
    selectFiFormationName,
    selectFiInviteCode,
    selectIsWalletServiceFormed,
    setWalletServiceGuardianFee,
    updateWalletServiceMetadata,
} from '@fedi/common/redux'
import {
    RpcFiFederationMetadataUpdate,
    RpcFiOperationError,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { LightningAttachProgress } from '../components/feature/walletservice/LightningAttachProgress'
import { LightningBanner } from '../components/feature/walletservice/LightningProviderBanner'
import { LightningProviderPicker } from '../components/feature/walletservice/LightningProviderPicker'
import {
    ServiceFeePicker,
    ServiceFeeSelection,
    formatFeePercent,
} from '../components/feature/walletservice/ServiceFeePicker'
import {
    ServiceActionRow,
    ServiceIconThumbnail,
    ServiceInfoRow,
    ServiceSettingsDivider,
    ServiceSettingsSection,
} from '../components/feature/walletservice/ServiceSettingsRow'
import { ServiceSheet } from '../components/feature/walletservice/ServiceSheet'
import { WalletServiceInviteSheet } from '../components/feature/walletservice/WalletServiceInviteSheet'
import { FieldInput } from '../components/ui/FieldInput'
import { Column } from '../components/ui/Flex'
import HelpTooltip from '../components/ui/HelpTooltip'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import { useLaunchZendesk } from '../utils/hooks/support'

const log = makeLog('WalletServiceSettings')

/**
 * How long the sheet gets to close before the support view opens over it.
 * The same beat HistoryDetailOverlay leaves for the same reason.
 */
const SUPPORT_LAUNCH_DELAY_MS = 300

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceSettings'
>

/**
 * The metadata fields that carry a user-entered value. `welcomeMessage` is the
 * variant Fedi renders as the wallet description, so the description row writes
 * that variant rather than a description-specific one, which the bridge
 * contract does not have.
 */
type EditableField = 'name' | 'welcomeMessage' | 'iconUrl'

/**
 * Manifold's icon URL limit. Compared here against character count, not bytes:
 * a non-ASCII URL could slip past and be rejected server-side, which is the
 * safe direction to be wrong in, since Manifold validates authoritatively.
 */
const ICON_URL_MAX_LENGTH = 2048

/** Why an icon URL cannot be saved, or `null` when it can. */
type IconUrlError = 'invalid' | 'nonPublicHost' | null

/** A disabled row still needs a handler it will never call. */
const noop = () => undefined

// `as const`, not `Record<…, string>`: t() only accepts keys it can prove
// exist, and widening these to string discards that proof
const EDITOR_TITLE_KEYS = {
    name: 'feature.wallet-service.settings-name',
    welcomeMessage: 'feature.wallet-service.settings-description',
    iconUrl: 'feature.wallet-service.settings-icon',
} as const satisfies Record<EditableField, string>

const ICON_URL_ERROR_KEYS = {
    invalid: 'feature.wallet-service.settings-icon-invalid',
    nonPublicHost: 'feature.wallet-service.settings-icon-not-public',
} as const satisfies Record<Exclude<IconUrlError, null>, string>

/**
 * Mirrors `FederationMetadataIconUrl::try_from` in Manifold, which requires an
 * http(s) URL on a publicly resolvable host. Checked here because a rejected
 * write comes back as a generic error toast, which is a poor way to find out
 * you typed `localhost`.
 */
const getIconUrlError = (raw: string): IconUrlError => {
    const value = raw.trim()
    if (value === '' || value.length > ICON_URL_MAX_LENGTH) return 'invalid'

    let url: URL
    try {
        url = new URL(value)
    } catch {
        return 'invalid'
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid'

    // `URL` brackets an IPv6 literal, and a trailing dot is a valid way to
    // write a fully qualified name — neither changes what the host resolves to
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
    const lower = host.toLowerCase()
    if (lower === 'localhost' || lower.endsWith('.localhost'))
        return 'nonPublicHost'
    if (/^127\./.test(host) || host === '::1') return 'nonPublicHost'
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return 'nonPublicHost'
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'nonPublicHost'
    if (/^169\.254\./.test(host) || /^fe[89ab][0-9a-f]:/i.test(host))
        return 'nonPublicHost'
    // a bare name with no dot cannot resolve outside the local network
    if (!host.includes('.') && !host.includes(':')) return 'nonPublicHost'

    return null
}

/** Which bottom sheet is open, if any. */
type OpenSheet =
    | 'fee'
    | 'provider'
    | 'terms'
    | 'invite'
    | 'stableBalance'
    | null

const WalletServiceSettings: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const { launchZendesk } = useLaunchZendesk()

    const name = useAppSelector(selectFiFormationName)
    const inviteCode = useAppSelector(selectFiInviteCode)
    // the rate the federation applies, read from its consensus metadata — not
    // `intent.guardianFeePpm`, which is creation-time and always 0
    const {
        feePpm: guardianFeePpm,
        refresh: refreshAppliedFee,
        markApplied,
    } = useAppliedGuardianFeePpm()
    const guardianCount =
        useAppSelector(selectFiFormation)?.intent.federationSize ?? 0
    const federationId = useWalletServiceFederationId()
    // every metadata write is a guardian consensus change, which the bridge
    // only accepts once the wallet service is formed
    const isFormed = useAppSelector(selectIsWalletServiceFormed)

    const [editing, setEditing] = useState<EditableField | null>(null)
    const [draftValue, setDraftValue] = useState('')
    // the icon, description and terms the federation publishes — read from its
    // consensus metadata, not from the formation intent, which carries none of
    // them. `markApplied` holds a just-saved value until consensus agrees.
    const {
        iconUrl,
        description,
        termsUrl,
        markApplied: markMetadataApplied,
    } = useWalletServiceMetadata()
    const [isSaving, setIsSaving] = useState(false)
    const [termsJustInstalled, setTermsJustInstalled] = useState(false)
    const [sheet, setSheet] = useState<OpenSheet>(null)
    // a placeholder only: the applied rate is fetched asynchronously, so it is
    // not available on first render. `ServiceFeePicker` reports its own
    // selection on mount, seeded from `initialPpm`, and that replaces this
    // before the sheet's Save can be pressed.
    const [feeSelection, setFeeSelection] = useState<ServiceFeeSelection>({
        guardianFeePpm: DEFAULT_GUARDIAN_FEE_PPM,
        isValid: true,
    })
    // the same hook the creation step uses, so the two hosts cannot disagree
    // about what is attached. Mounting only reads the canonical operation; the
    // request is `start`, and only the sheet's button calls it.
    const {
        status: gatewayStatus,
        stage: gatewayStage,
        isRequesting: isRequestingGateway,
        errorCode: gatewayErrorCode,
        isRetryable: isGatewayErrorRetryable,
        start: startGatewayAttach,
    } = useWalletServiceLightningAttach()
    const hasGateway = gatewayStatus === 'attached'
    const isAttachingGateway = gatewayStatus === 'attaching'
    // the durable read has not answered, so nothing here may be asserted or
    // changed yet — "Not set" is a claim, and this is the state before we can
    // make one
    const isGatewayUnknown = gatewayStatus === 'unknown'
    // preselected, as on the creation step; unticking is what takes deliberate
    // effort, and once attached it is not offered at all
    const [isProviderSelected, setIsProviderSelected] = useState(true)

    const closeSheet = useCallback(() => setSheet(null), [])

    const showError = useCallback(
        (error: unknown) => {
            log.error('wallet service settings', error)
            toast.show({
                content: getWalletServiceRetryableError(
                    t,
                    (error as RpcFiOperationError | undefined)?.code,
                ),
                status: 'error',
            })
        },
        [toast, t],
    )

    const saveMetadata = useCallback(
        async (update: RpcFiFederationMetadataUpdate) => {
            setIsSaving(true)
            try {
                await dispatch(
                    updateWalletServiceMetadata({ fedimint, update }),
                ).unwrap()
                toast.show({
                    content: t('feature.wallet-service.settings-saved'),
                    status: 'success',
                })
                return true
            } catch (error) {
                showError(error)
                return false
            } finally {
                setIsSaving(false)
            }
        },
        [dispatch, fedimint, toast, t, showError],
    )

    const openEditor = useCallback((field: EditableField, current: string) => {
        setDraftValue(current)
        setEditing(field)
    }, [])

    const handleSaveEdit = useCallback(async () => {
        if (!editing) return
        const value = draftValue.trim()
        // an invalid icon url never reaches the bridge: Manifold would reject
        // it, and the sheet already says why
        if (editing === 'iconUrl' && getIconUrlError(value)) return
        const update: RpcFiFederationMetadataUpdate = { type: editing, value }
        if (await saveMetadata(update)) {
            // consensus lags the save, so hold the new value on screen until a
            // read agrees with it
            if (editing === 'iconUrl') markMetadataApplied({ iconUrl: value })
            if (editing === 'welcomeMessage')
                markMetadataApplied({ description: value })
            setEditing(null)
        }
    }, [saveMetadata, draftValue, editing, markMetadataApplied])

    const handleSaveFee = useCallback(async () => {
        setIsSaving(true)
        try {
            await dispatch(
                setWalletServiceGuardianFee({
                    fedimint,
                    guardianFeePpm: feeSelection.guardianFeePpm,
                }),
            ).unwrap()
            // the row reads the applied rate from federation consensus, which
            // lags the save by a moment; hold the saved value until it agrees
            markApplied(feeSelection.guardianFeePpm)
            // not awaited: the row already shows the held value, and the save
            // must not wait on a metadata read that may lag or fail
            refreshAppliedFee()
            toast.show(
                t('feature.wallet-service.fee-saved', {
                    rate: formatFeePercent(
                        guardianFeePpmToPercent(feeSelection.guardianFeePpm),
                    ),
                }),
            )
            closeSheet()
        } catch (error) {
            showError(error)
        } finally {
            setIsSaving(false)
        }
    }, [
        dispatch,
        fedimint,
        feeSelection,
        toast,
        t,
        closeSheet,
        showError,
        markApplied,
        refreshAppliedFee,
    ])

    /**
     * There is still no entitlement rpc, so nothing here enables the feature.
     * What it does now is hand the request to a human: the confirm step opens
     * the same support conversation the transaction detail overlay opens.
     *
     * That is the whole reason the row is back. Before, the confirm showed a
     * "the team will be in touch" toast and called nothing at all, so the
     * request reached no one — which is why the section was parked on 23 Aug.
     *
     * `useLaunchZendesk` rather than `launchZendeskSupport`: the hook sends a
     * user who has not granted support permission to the Help Centre, where
     * the bare function only logs and returns, leaving the tap silent.
     *
     * Closed first, then launched a beat later, matching HistoryDetailOverlay
     * — the sheet's dismiss animation and the messaging view do not co-operate
     * if they start together.
     */
    const handleRequestStableBalance = useCallback(() => {
        closeSheet()
        setTimeout(() => launchZendesk(), SUPPORT_LAUNCH_DELAY_MS)
    }, [closeSheet, launchZendesk])

    const handleUseReadyMadeTerms = useCallback(async () => {
        // this variant carries no value: it installs one fixed approved
        // document, so there is nothing for the user to enter
        if (await saveMetadata({ type: 'termsOfService' })) {
            // the url it installs is Manifold's to choose, so the row cannot
            // hold the value the way the icon does — it holds the fact instead,
            // until consensus publishes the url itself
            setTermsJustInstalled(true)
            closeSheet()
        }
    }, [saveMetadata, closeSheet])

    // `null`, not falsy: 0 ppm is a rate the guardians can deliberately set to
    // stop new accrual, and it must not read as "not set"
    const feeRateLabel =
        guardianFeePpm === null
            ? t('feature.wallet-service.settings-not-set')
            : t('feature.wallet-service.fee-per-transaction', {
                  rate: formatFeePercent(
                      guardianFeePpmToPercent(guardianFeePpm),
                  ),
              })

    // the installed url arrives from consensus a moment after the save, so the
    // local flag covers the gap rather than letting the row read "not set"
    // straight after installing terms that worked
    const hasTerms = termsUrl !== null || termsJustInstalled

    // only surfaced once something has been typed: an empty sheet is not yet a
    // mistake, it is an unstarted edit
    const iconUrlError =
        editing === 'iconUrl' && draftValue.trim() !== ''
            ? getIconUrlError(draftValue)
            : null

    // four states, not two: a running request is neither an attached provider
    // nor an absent one, and an unanswered read is neither of the three. Saying
    // "Not set" before the read lands is what made an attached provider look
    // absent on every fresh mount.
    const providerLabel = t(
        hasGateway
            ? 'feature.wallet-service.lightning-managed'
            : isAttachingGateway
              ? 'feature.wallet-service.lightning-attaching'
              : isGatewayUnknown
                ? 'feature.wallet-service.lightning-checking'
                : 'feature.wallet-service.lightning-none',
    )

    const providerBanner: LightningBanner | null =
        gatewayStatus === 'failed'
            ? {
                  tone: 'error',
                  message: isGatewayErrorRetryable
                      ? getWalletServiceRetryableError(t, gatewayErrorCode)
                      : t(getWalletServiceErrorKey(gatewayErrorCode)),
              }
            : isAttachingGateway
              ? {
                    // the attach is watched app-wide, so it genuinely does
                    // carry on without this sheet being open
                    tone: 'warn',
                    message: t(
                        'feature.wallet-service.lightning-still-setting-up',
                    ),
                }
              : null

    const style = styles(theme)

    return (
        <SafeScrollArea edges="notop" padding="lg">
            <Column gap="lg">
                <ServiceSettingsSection title={t('words.general')}>
                    {/* Manifold's icon is url-only by design — no upload is
                        implied — so the row takes a public http(s) address
                        rather than a picture from the device */}
                    <ServiceInfoRow
                        label={t('feature.wallet-service.settings-icon')}
                        value={
                            iconUrl ??
                            t('feature.wallet-service.settings-not-set')
                        }
                        // a url is too long for the row: the host and the
                        // filename identify the icon, the path between them
                        // does not
                        valueEllipsizeMode="middle"
                        thumbnail={
                            <ServiceIconThumbnail
                                url={iconUrl}
                                fallback={(name ?? 'W').charAt(0).toUpperCase()}
                            />
                        }
                        disabled={!isFormed}
                        onEdit={() => openEditor('iconUrl', iconUrl ?? '')}
                        testID="settings-icon-row"
                    />
                    <ServiceSettingsDivider />
                    <ServiceInfoRow
                        label={t('feature.wallet-service.settings-name')}
                        value={name}
                        disabled={!isFormed}
                        onEdit={() => openEditor('name', name ?? '')}
                        testID="settings-name-row"
                    />
                    <ServiceSettingsDivider />
                    <ServiceInfoRow
                        label={t('feature.wallet-service.settings-description')}
                        value={
                            description ??
                            t('feature.wallet-service.settings-not-set')
                        }
                        disabled={!isFormed}
                        onEdit={() =>
                            openEditor('welcomeMessage', description ?? '')
                        }
                        testID="settings-description-row"
                    />
                </ServiceSettingsSection>

                <ServiceSettingsSection title={t('words.manage')}>
                    <ServiceActionRow
                        icon="Bolt"
                        name={t('feature.wallet-service.settings-lightning')}
                        detail={providerLabel}
                        onPress={() => setSheet('provider')}
                        testID="settings-lightning-row"
                    />
                    <ServiceSettingsDivider />
                    <ServiceActionRow
                        icon="Percent"
                        name={t('feature.wallet-service.settings-fee')}
                        detail={feeRateLabel}
                        onPress={() => setSheet('fee')}
                        testID="settings-fee-row"
                    />
                    <ServiceSettingsDivider />
                    {/* the guardian fees dashboard is the operator's real
                        withdraw path: same fee earnings, and it owns the only
                        rpc that can pay them out */}
                    <ServiceActionRow
                        icon="Download"
                        name={t('feature.wallet-service.withdraw-balance')}
                        detail={t(
                            'feature.wallet-service.settings-withdraw-detail',
                        )}
                        onPress={() => {
                            if (!federationId) return
                            navigation.navigate('GuardianFees', {
                                federationId,
                            })
                        }}
                        testID="settings-withdraw-row"
                    />
                </ServiceSettingsSection>

                {/* Parked on 23 Aug because the row led nowhere: no entitlement
                    rpc, and a confirm that only showed a toast. Restored per
                    #11991 — the confirm now opens support, so the row has a
                    real destination even though the feature still cannot be
                    switched on from here. */}
                <ServiceSettingsSection title={t('words.features')}>
                    <ServiceActionRow
                        icon="Usd"
                        name={t(
                            'feature.wallet-service.settings-stable-balance',
                        )}
                        detail={t(
                            'feature.wallet-service.settings-stable-balance-detail',
                        )}
                        onPress={() => setSheet('stableBalance')}
                        testID="settings-stable-balance-row"
                    />
                </ServiceSettingsSection>

                <ServiceSettingsSection title={t('words.legal')}>
                    <ServiceActionRow
                        icon="File"
                        name={t('feature.wallet-service.settings-terms')}
                        detail={
                            hasTerms
                                ? t(
                                      'feature.wallet-service.settings-terms-installed',
                                  )
                                : t(
                                      'feature.wallet-service.settings-terms-not-set',
                                  )
                        }
                        disabled={!isFormed}
                        trailing={
                            <HelpTooltip svgName="Info" svgProps={{ size: 14 }}>
                                <Text caption>
                                    {t(
                                        'feature.wallet-service.settings-terms-help',
                                    )}
                                </Text>
                            </HelpTooltip>
                        }
                        onPress={() => setSheet('terms')}
                        testID="settings-terms-row"
                    />
                </ServiceSettingsSection>

                <ServiceSettingsSection title={t('words.members')}>
                    <ServiceActionRow
                        icon="SocialPeople"
                        name={t('feature.wallet-service.settings-invite')}
                        detail={t(
                            'feature.wallet-service.settings-invite-detail',
                        )}
                        disabled={!inviteCode}
                        onPress={() => setSheet('invite')}
                        testID="settings-invite-row"
                    />
                </ServiceSettingsSection>
            </Column>

            <ServiceSheet
                show={editing !== null}
                loading={isSaving}
                onDismiss={() => setEditing(null)}
                title={t(EDITOR_TITLE_KEYS[editing ?? 'name'])}
                buttons={[
                    {
                        text: t('words.save'),
                        primary: true,
                        disabled:
                            draftValue.trim().length === 0 ||
                            iconUrlError !== null,
                        onPress: handleSaveEdit,
                    },
                    {
                        text: t('words.cancel'),
                        onPress: () => setEditing(null),
                    },
                ]}>
                <Column gap="xs" fullWidth>
                    <FieldInput
                        value={draftValue}
                        onChangeText={setDraftValue}
                        placeholder={
                            editing === 'iconUrl'
                                ? t(
                                      'feature.wallet-service.settings-icon-placeholder',
                                  )
                                : undefined
                        }
                        testID="settings-edit-input"
                    />
                    {iconUrlError !== null && (
                        <Text caption style={style.editError}>
                            {t(ICON_URL_ERROR_KEYS[iconUrlError])}
                        </Text>
                    )}
                </Column>
            </ServiceSheet>

            {/* the same picker the onboarding fee step uses, without the
                earnings breakdown, which does not fit a sheet */}
            <ServiceSheet
                show={sheet === 'fee'}
                loading={isSaving}
                onDismiss={closeSheet}
                title={t('feature.wallet-service.fee-title')}
                description={t('feature.wallet-service.settings-fee-help')}
                buttons={[
                    {
                        text: t('words.save'),
                        primary: true,
                        disabled: !feeSelection.isValid,
                        onPress: handleSaveFee,
                    },
                ]}>
                <ServiceFeePicker
                    guardianCount={guardianCount}
                    // `??`, not `||`: a published 0 must seed the picker as 0
                    // rather than falling through to the default rate
                    initialPpm={guardianFeePpm ?? undefined}
                    onChange={setFeeSelection}
                    showBreakdown={false}
                    showLabel={false}
                    note={t('feature.wallet-service.settings-fee-members-note')}
                />
            </ServiceSheet>

            <ServiceSheet
                show={sheet === 'provider'}
                /* Never locked. The lock this replaces existed because the
                   attach was watched by whatever screen was mounted, so leaving
                   killed it. `WalletServiceMonitor` owns the operation now, so
                   closing costs nothing — the poll continues, the row keeps
                   reading `Attaching…`, and the dashboard reports the same
                   progress. While a request runs this sheet is informational
                   anyway, so holding someone here would trap them in front of
                   something they cannot act on. */
                onDismiss={closeSheet}
                title={t('feature.wallet-service.settings-lightning')}
                description={t('feature.wallet-service.lightning-sheet-help')}
                buttons={
                    // one-way: once a provider is attached there is nothing to
                    // request, which is what finally makes the note true
                    hasGateway
                        ? [{ text: t('words.done'), onPress: closeSheet }]
                        : [
                              {
                                  text: t(
                                      gatewayStatus === 'failed'
                                          ? 'words.retry'
                                          : 'feature.wallet-service.lightning-attach-action',
                                  ),
                                  primary: true,
                                  // nothing may be requested against a state we
                                  // have not read back yet
                                  disabled:
                                      isAttachingGateway ||
                                      isGatewayUnknown ||
                                      isRequestingGateway ||
                                      !isProviderSelected,
                                  onPress: startGatewayAttach,
                              },
                              {
                                  text: t('words.done'),
                                  onPress: closeSheet,
                              },
                          ]
                }>
                {isAttachingGateway && gatewayStage && (
                    <LightningAttachProgress stage={gatewayStage} />
                )}
                <LightningProviderPicker
                    isSelected={hasGateway || isProviderSelected}
                    // fixed once attached, and while a request runs there is
                    // nothing to change until it answers
                    onToggle={
                        hasGateway ||
                        isAttachingGateway ||
                        isGatewayUnknown ||
                        isRequestingGateway
                            ? undefined
                            : () => setIsProviderSelected(current => !current)
                    }
                    isAttached={hasGateway}
                    banner={providerBanner}
                />
            </ServiceSheet>

            {/* the design offers two routes; only the fixed document can be
                installed, so the other says so rather than disappearing */}
            <ServiceSheet
                show={sheet === 'terms'}
                loading={isSaving}
                onDismiss={closeSheet}
                title={t('feature.wallet-service.settings-terms')}
                description={t(
                    'feature.wallet-service.settings-terms-sheet-help',
                )}
                buttons={[]}>
                <Column fullWidth style={style.sheetCard}>
                    <ServiceActionRow
                        icon="File"
                        name={t(
                            'feature.wallet-service.settings-terms-ready-made',
                        )}
                        detail={t(
                            'feature.wallet-service.settings-terms-ready-made-detail',
                        )}
                        onPress={handleUseReadyMadeTerms}
                        testID="terms-ready-made-row"
                    />
                    <ServiceSettingsDivider />
                    {/* no metadata variant carries a url, so this cannot be
                        installed yet — the row says so rather than offering an
                        action it would then refuse */}
                    <ServiceActionRow
                        icon="Globe"
                        name={t(
                            'feature.wallet-service.settings-terms-link-own',
                        )}
                        detail={t(
                            'feature.wallet-service.settings-terms-link-own-unavailable',
                        )}
                        disabled
                        onPress={noop}
                        testID="terms-link-own-row"
                    />
                </Column>
            </ServiceSheet>

            {/* The confirm step stays, rather than the row opening support on
                tap: handing someone to a support conversation is a thing they
                should choose, not something a mis-tap does for them. */}
            <ServiceSheet
                show={sheet === 'stableBalance'}
                onDismiss={closeSheet}
                title={t('feature.wallet-service.settings-stable-balance')}
                description={t(
                    'feature.wallet-service.settings-stable-balance-sheet-help',
                )}
                note={t('feature.wallet-service.settings-stable-balance-note')}
                buttons={[
                    {
                        text: t(
                            'feature.wallet-service.settings-stable-balance-request',
                        ),
                        primary: true,
                        onPress: handleRequestStableBalance,
                    },
                    {
                        text: t('phrases.not-now'),
                        onPress: closeSheet,
                    },
                ]}
            />

            {inviteCode && (
                <WalletServiceInviteSheet
                    show={sheet === 'invite'}
                    inviteCode={inviteCode}
                    serviceName={name}
                    onDismiss={closeSheet}
                />
            )}
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        sheetCard: {
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            overflow: 'hidden',
        },
        editError: {
            color: theme.colors.red,
        },
    })

export default WalletServiceSettings
