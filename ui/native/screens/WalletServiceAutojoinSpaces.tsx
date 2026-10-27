import Clipboard from '@react-native-clipboard/clipboard'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { TFunction } from 'i18next'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    useWalletServiceFederationId,
    useWalletServiceMetadata,
} from '@fedi/common/hooks/fa'
import { useCreatedCommunities } from '@fedi/common/hooks/federation'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    getWalletServiceMaintenanceErrorKey,
    updateWalletServiceMetadata,
} from '@fedi/common/redux'
import type { CommunityPreview } from '@fedi/common/types'
import type { RpcFaOperationError } from '@fedi/common/types/bindings'
import { getCommunityPreview } from '@fedi/common/utils/FederationUtils'
import { extractCommunityInviteCode } from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import {
    ServiceActionRow,
    ServiceSettingsDivider,
    ServiceSettingsSection,
} from '../components/feature/walletservice/ServiceSettingsRow'
import { ServiceSheet } from '../components/feature/walletservice/ServiceSheet'
import { FieldInput } from '../components/ui/FieldInput'
import { Column, Row } from '../components/ui/Flex'
import Header from '../components/ui/Header'
import { Pressable } from '../components/ui/Pressable'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('WalletServiceAutojoinSpaces')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceAutojoinSpaces'
>

/** The most spaces the app joins from one federation's list. */
const MAX_AUTOJOIN_SPACES = 10

const LOGO_SIZE = 32

const normaliseCode = (code: string) => code.trim().toLowerCase()

/**
 * The published value, de-duplicated. Codes arrive normalised. Never cut to
 * the limit: a list published longer than that must lose only the space the
 * admin removed.
 */
const toAutojoinValue = (codes: string[]) =>
    JSON.stringify(Array.from(new Set(codes)))

/** `null` is a preview that failed; a missing entry is one still loading. */
type Previews = Record<string, CommunityPreview | null>

type Candidate = {
    code: string
    refusal: 'invalid' | 'wrongType' | 'duplicate' | null
}

const getCandidateMessage = (
    t: TFunction,
    candidate: Candidate,
    preview: CommunityPreview | null | undefined,
) => {
    switch (candidate.refusal) {
        case 'invalid':
            return t('feature.wallet-service.settings-autojoin-no-code')
        case 'wrongType':
            return t('feature.wallet-service.settings-autojoin-wrong-type')
        case 'duplicate':
            return t('feature.wallet-service.settings-autojoin-duplicate')
    }
    if (preview === undefined)
        return t('feature.wallet-service.settings-autojoin-checking')
    if (preview === null)
        return t('feature.wallet-service.settings-autojoin-not-found')
    return t('feature.wallet-service.settings-autojoin-found', {
        name: preview.name,
    })
}

type OpenSheet = 'add' | 'paste' | null

/** A failed save, kept so Try again repeats exactly that value. */
type FailedSave = { value: string; error: RpcFaOperationError | undefined }

const SpaceRow: React.FC<{
    code: string
    name: string
    meta?: CommunityPreview['meta']
    detail: string | null
    trailing?: React.ReactNode
    onPress?: () => void
    testID?: string
}> = ({ code, name, meta, detail, trailing, onPress, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable testID={testID} containerStyle={style.row} onPress={onPress}>
            <Row align="center" gap="md" grow>
                <FederationLogo
                    federation={meta ? { id: code, meta } : undefined}
                    size={LOGO_SIZE}
                    shape="circle"
                />
                <Column gap={2} grow shrink>
                    <Text
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        style={style.rowName}>
                        {name}
                    </Text>
                    {detail ? (
                        <Text
                            numberOfLines={1}
                            ellipsizeMode="middle"
                            style={style.rowDetail}>
                            {detail}
                        </Text>
                    ) : null}
                </Column>
                {trailing}
            </Row>
        </Pressable>
    )
}

const getSpaceName = (
    t: TFunction,
    code: string,
    preview: CommunityPreview | null | undefined,
) => {
    if (preview) return preview.name
    if (preview === null)
        return t('feature.wallet-service.settings-autojoin-not-found')
    return code
}

const FailedSaveBanner: React.FC<{
    failedSave: FailedSave
    isSaving: boolean
    onRetry: (value: string) => void
}> = ({ failedSave, isSaving, onRetry }) => {
    const { t } = useTranslation()
    const needsUpdate =
        failedSave.error?.detail?.type === 'maintenanceUnsupported'

    return (
        <WarningBanner
            level="warning"
            title={
                needsUpdate
                    ? t('feature.wallet-service.settings-autojoin-update-title')
                    : undefined
            }
            message={t(getWalletServiceMaintenanceErrorKey(failedSave.error))}
            action={
                <Button
                    size="sm"
                    outline
                    testID="autojoin-retry"
                    title={t('words.retry')}
                    disabled={isSaving}
                    onPress={() => onRetry(failedSave.value)}
                />
            }
        />
    )
}

const EmptyAutojoinSpaces: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Column center gap="sm" style={style.empty}>
            <SvgImage
                name="Community"
                size="lg"
                color={theme.colors.darkGrey}
            />
            <Text bold center>
                {t('feature.wallet-service.settings-autojoin-empty-title')}
            </Text>
            <Text caption center style={style.lead}>
                {t('feature.wallet-service.settings-autojoin-empty-body')}
            </Text>
        </Column>
    )
}

/** Shown in place of the list: an empty list would read as "none published". */
const LoadFailedBanner: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    const { t } = useTranslation()

    return (
        <View testID="autojoin-load-error">
            <WarningBanner
                level="warning"
                message={t(
                    'feature.wallet-service.settings-autojoin-load-failed',
                )}
                action={
                    <Button
                        size="sm"
                        outline
                        testID="autojoin-load-retry"
                        title={t('words.retry')}
                        onPress={onRetry}
                    />
                }
            />
        </View>
    )
}

const AutojoinSpacesList: React.FC<{
    codes: string[]
    previews: Previews
    isSaving: boolean
    overLimitNote: string | undefined
    onRemove: (code: string) => void
}> = ({ codes, previews, isSaving, overLimitNote, onRemove }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const renderSpace = (code: string, index: number) => {
        const preview = previews[code]
        const handleRemove = () => {
            if (isSaving) return
            onRemove(code)
        }
        return (
            <React.Fragment key={code}>
                {index > 0 && <ServiceSettingsDivider />}
                <SpaceRow
                    code={code}
                    name={getSpaceName(t, code, preview)}
                    meta={preview?.meta}
                    detail={preview === undefined ? null : code}
                    trailing={
                        <PressableIcon
                            testID={`autojoin-remove-${index}`}
                            svgName="Close"
                            svgProps={{
                                size: 16,
                                color: theme.colors.darkGrey,
                            }}
                            onPress={handleRemove}
                        />
                    }
                />
            </React.Fragment>
        )
    }

    return (
        <Column gap="xs" fullWidth>
            <ServiceSettingsSection title={t('words.spaces')}>
                {codes.map(renderSpace)}
            </ServiceSettingsSection>
            <Text small style={style.count}>
                {t('feature.wallet-service.settings-autojoin-limit', {
                    count: new Set(codes).size,
                    max: MAX_AUTOJOIN_SPACES,
                })}
            </Text>
            {overLimitNote && (
                <Text small testID="autojoin-over-limit" style={style.refused}>
                    {overLimitNote}
                </Text>
            )}
        </Column>
    )
}

/** The failed read, the list, or the empty state. */
const AutojoinSpacesBody: React.FC<
    React.ComponentProps<typeof AutojoinSpacesList> & {
        hasFailed: boolean
        onRetry: () => void
    }
> = ({ hasFailed, onRetry, ...list }) => {
    if (hasFailed) return <LoadFailedBanner onRetry={onRetry} />
    if (list.codes.length === 0) return <EmptyAutojoinSpaces />
    return <AutojoinSpacesList {...list} />
}

type CreatedCommunities = ReturnType<
    typeof useCreatedCommunities
>['createdCommunities']

const AddSpaceSheet: React.FC<{
    show: boolean
    isSaving: boolean
    hasLoaded: boolean
    isFull: boolean
    fullNote: string | undefined
    communities: CreatedCommunities
    linkedCodes: Set<string>
    selectedCode: string | null
    onSelect: (code: string | null) => void
    onAdd: (code: string) => void
    onPaste: () => void
    onDismiss: () => void
}> = ({
    show,
    isSaving,
    hasLoaded,
    isFull,
    fullNote,
    communities,
    linkedCodes,
    selectedCode,
    onSelect,
    onAdd,
    onPaste,
    onDismiss,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const renderCommunity = (
        community: CreatedCommunities[number],
        index: number,
    ) => {
        const code = normaliseCode(community.communityInvite.invite_code_str)
        const isLinked = linkedCodes.has(code)
        const isSelected = selectedCode === code
        const checkColor = isLinked ? theme.colors.grey : theme.colors.primary
        const showCheck = isLinked || isSelected
        const handlePress = () => onSelect(isSelected ? null : code)
        return (
            <React.Fragment key={code}>
                {index > 0 && <ServiceSettingsDivider />}
                <SpaceRow
                    testID={`autojoin-pick-${index}`}
                    code={code}
                    name={community.name}
                    meta={community.meta}
                    detail={
                        isLinked
                            ? t(
                                  'feature.wallet-service.settings-autojoin-linked',
                              )
                            : null
                    }
                    trailing={
                        showCheck ? (
                            <SvgImage
                                name="Check"
                                size="sm"
                                color={checkColor}
                            />
                        ) : null
                    }
                    // a linked space is settled, not
                    // blocked: it simply does not press
                    onPress={isLinked ? undefined : handlePress}
                />
            </React.Fragment>
        )
    }

    const handleConfirm = () => {
        if (selectedCode !== null) onAdd(selectedCode)
    }

    return (
        <ServiceSheet
            show={show}
            loading={isSaving}
            onDismiss={onDismiss}
            title={t('feature.wallet-service.settings-autojoin-add')}
            description={t('feature.wallet-service.settings-autojoin-add-help')}
            note={fullNote}
            buttons={[
                {
                    text: t('words.add'),
                    primary: true,
                    testID: 'autojoin-add-confirm',
                    disabled: selectedCode === null || isFull || !hasLoaded,
                    onPress: handleConfirm,
                },
                { text: t('words.cancel'), onPress: onDismiss },
            ]}>
            <ServiceSettingsSection
                title={t(
                    'feature.wallet-service.settings-autojoin-your-spaces',
                )}>
                {communities.map(renderCommunity)}
            </ServiceSettingsSection>
            <Column fullWidth style={style.sheetCard}>
                <ServiceActionRow
                    icon="Clipboard"
                    name={t('feature.wallet-service.settings-autojoin-paste')}
                    detail={t(
                        'feature.wallet-service.settings-autojoin-paste-other',
                    )}
                    onPress={onPaste}
                    testID="autojoin-paste"
                />
            </Column>
        </ServiceSheet>
    )
}

const getCandidateMessageStyle = (
    style: ReturnType<typeof styles>,
    canAdd: boolean,
    isRefused: boolean,
) => {
    if (canAdd) return style.found
    if (isRefused) return style.refused
    return style.lead
}

const PasteCodeField: React.FC<{
    text: string
    message: string | null
    messageStyle: ReturnType<typeof getCandidateMessageStyle>
    onChangeText: (text: string) => void
}> = ({ text, message, messageStyle, onChangeText }) => {
    const { t } = useTranslation()

    // reads the clipboard only: nothing here joins the space
    // or the federation a code names
    const handlePaste = () =>
        Clipboard.getString()
            .then(onChangeText)
            .catch(error => log.warn('clipboard read', error))

    return (
        <Column gap="sm" fullWidth>
            <FieldInput
                value={text}
                onChangeText={onChangeText}
                placeholder={t(
                    'feature.wallet-service.settings-autojoin-paste-placeholder',
                )}
                autoCapitalize="none"
                autoCorrect={false}
                testID="autojoin-paste-input"
            />
            {message !== null && (
                <Text
                    small
                    testID="autojoin-paste-message"
                    style={messageStyle}>
                    {message}
                </Text>
            )}
            <Button
                testID="autojoin-paste-clipboard"
                fullWidth
                day
                icon={<SvgImage name="Clipboard" />}
                title={t('feature.omni.action-paste')}
                onPress={handlePaste}
            />
        </Column>
    )
}

const PasteSpaceSheet: React.FC<{
    show: boolean
    isSaving: boolean
    hasLoaded: boolean
    isFull: boolean
    fullNote: string | undefined
    text: string
    candidate: Candidate | null
    candidatePreview: CommunityPreview | null | undefined
    onChangeText: (text: string) => void
    onAdd: (code: string) => void
    onDismiss: () => void
}> = ({
    show,
    isSaving,
    hasLoaded,
    isFull,
    fullNote,
    text,
    candidate,
    candidatePreview,
    onChangeText,
    onAdd,
    onDismiss,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const isRefused =
        candidate !== null &&
        (candidate.refusal !== null || candidatePreview === null)
    const canAdd =
        candidate !== null &&
        candidate.refusal === null &&
        Boolean(candidatePreview) &&
        !isFull &&
        hasLoaded

    const handleAdd = () => {
        if (candidate !== null && canAdd) onAdd(candidate.code)
    }

    return (
        <ServiceSheet
            show={show}
            loading={isSaving}
            onDismiss={onDismiss}
            title={t('feature.wallet-service.settings-autojoin-paste')}
            description={t(
                'feature.wallet-service.settings-autojoin-paste-help',
            )}
            note={fullNote}
            buttons={[
                {
                    text: t('words.add'),
                    primary: true,
                    testID: 'autojoin-paste-confirm',
                    disabled: !canAdd,
                    onPress: handleAdd,
                },
                { text: t('words.cancel'), onPress: onDismiss },
            ]}>
            <PasteCodeField
                text={text}
                message={
                    candidate === null
                        ? null
                        : getCandidateMessage(t, candidate, candidatePreview)
                }
                messageStyle={getCandidateMessageStyle(
                    style,
                    canAdd,
                    isRefused,
                )}
                onChangeText={onChangeText}
            />
        </ServiceSheet>
    )
}

const RemoveSpaceSheet: React.FC<{
    show: boolean
    isSaving: boolean
    hasLoaded: boolean
    onConfirm: () => void
    onDismiss: () => void
}> = ({ show, isSaving, hasLoaded, onConfirm, onDismiss }) => {
    const { t } = useTranslation()

    return (
        <ServiceSheet
            show={show}
            loading={isSaving}
            onDismiss={onDismiss}
            title={t('feature.wallet-service.settings-autojoin-remove-title')}
            description={t(
                'feature.wallet-service.settings-autojoin-remove-body',
            )}
            buttons={[
                {
                    text: t('words.remove'),
                    primary: true,
                    testID: 'autojoin-confirm-remove',
                    disabled: !hasLoaded,
                    onPress: onConfirm,
                },
                { text: t('words.cancel'), onPress: onDismiss },
            ]}
        />
    )
}

/** The hint once the list holds as many spaces as the app joins, or more. */
const getFullNote = (t: TFunction, count: number) => {
    if (count > MAX_AUTOJOIN_SPACES)
        return t('feature.wallet-service.settings-autojoin-over-limit', {
            max: MAX_AUTOJOIN_SPACES,
        })
    if (count === MAX_AUTOJOIN_SPACES)
        return t('feature.wallet-service.settings-autojoin-full', {
            max: MAX_AUTOJOIN_SPACES,
        })
    return undefined
}

const getOverLimitNote = (t: TFunction, count: number) =>
    count > MAX_AUTOJOIN_SPACES ? getFullNote(t, count) : undefined

/** With nothing to pick, the picker step is only a detour. */
const getAddEntrySheet = (createdCount: number): OpenSheet =>
    createdCount > 0 ? 'add' : 'paste'

/**
 * The space code found in the pasted text and why it cannot be added, or
 * `null` when the field is empty.
 */
const classifyPastedCode = (
    raw: string,
    linkedCodes: Set<string>,
): Candidate | null => {
    const text = raw.trim()
    if (!text) return null
    const code = extractCommunityInviteCode(text)
    if (code === null) {
        const isFederation = text.toLowerCase().includes('fed1')
        return { code: text, refusal: isFederation ? 'wrongType' : 'invalid' }
    }
    if (linkedCodes.has(code)) return { code, refusal: 'duplicate' }
    return { code, refusal: null }
}

/**
 * One preview per code, asked once. A failed lookup is slow, so only a paste
 * asks again: a list change must not restart it.
 */
const useSpacePreviews = (codes: string[]) => {
    const fedimint = useFedimint()
    const [previews, setPreviews] = useState<Previews>({})
    const requested = useRef(new Set<string>())

    const loadPreview = useCallback(
        (code: string) => {
            if (requested.current.has(code)) return
            requested.current.add(code)
            getCommunityPreview(code, fedimint)
                .then(preview =>
                    setPreviews(held => ({ ...held, [code]: preview })),
                )
                .catch(error => {
                    log.warn('communityPreview for auto-join space', error)
                    setPreviews(held => ({ ...held, [code]: null }))
                })
        },
        [fedimint],
    )

    // back to "checking" while it runs, so further keystrokes naming the same
    // code do not ask again
    const retryPreview = useCallback(
        (code: string) => {
            requested.current.delete(code)
            setPreviews(({ [code]: _failed, ...held }) => held)
            loadPreview(code)
        },
        [loadPreview],
    )

    useEffect(() => {
        for (const code of codes) loadPreview(code)
    }, [codes, loadPreview])

    const requestPreview = (code: string) => {
        if (previews[code] === null) retryPreview(code)
        else loadPreview(code)
    }

    return { previews, requestPreview }
}

/** Saves the whole list in one guardian vote and keeps a failure for Retry. */
const useSaveAutojoinSpaces = (
    // holds the saved list app-wide until a read agrees, so the settings
    // screen and the next visit here build on it
    markApplied: (update: { autojoinCommunities: string }) => void,
    onSettled: () => void,
) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const federationId = useWalletServiceFederationId()
    const [isSaving, setIsSaving] = useState(false)
    const [failedSave, setFailedSave] = useState<FailedSave | null>(null)

    const save = async (value: string) => {
        setIsSaving(true)
        setFailedSave(null)
        try {
            await dispatch(
                updateWalletServiceMetadata({
                    fedimint,
                    federationId,
                    update: {
                        type: 'appSetting',
                        setting: 'autojoinCommunities',
                        value,
                    },
                }),
            ).unwrap()
            // consensus lags the save; hold the list until a read agrees
            markApplied({ autojoinCommunities: value })
            toast.show({
                content: t('feature.wallet-service.settings-autojoin-saved'),
                status: 'success',
            })
        } catch (error) {
            log.error('auto-join spaces save', error)
            setFailedSave({
                value,
                error: error as RpcFaOperationError | undefined,
            })
        } finally {
            setIsSaving(false)
            onSettled()
        }
    }

    return { save, isSaving, failedSave }
}

const WalletServiceAutojoinSpaces: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { autojoinSpaces, markApplied, hasLoaded, hasFailed, refresh } =
        useWalletServiceMetadata()
    const { createdCommunities } = useCreatedCommunities()

    const [sheet, setSheet] = useState<OpenSheet>(null)
    const [selectedCode, setSelectedCode] = useState<string | null>(null)
    const [pasteText, setPasteText] = useState('')
    const [removingCode, setRemovingCode] = useState<string | null>(null)

    const linkedCodes = new Set(autojoinSpaces)
    const isFull = linkedCodes.size >= MAX_AUTOJOIN_SPACES

    const { previews, requestPreview } = useSpacePreviews(autojoinSpaces)

    const closeSheet = useCallback(() => {
        setSheet(null)
        setSelectedCode(null)
        setPasteText('')
    }, [])

    const { save, isSaving, failedSave } = useSaveAutojoinSpaces(
        markApplied,
        () => {
            // closed either way: the outcome is reported on the list behind the
            // sheet, not inside it
            closeSheet()
            setRemovingCode(null)
        },
    )

    // before the first read the list is empty, so a save would replace the
    // published list instead of extending it
    const addCode = (code: string) => {
        if (!hasLoaded || isSaving || isFull) return
        save(toAutojoinValue([...autojoinSpaces, code]))
    }

    const handlePasteTextChange = (text: string) => {
        setPasteText(text)
        const pasted = classifyPastedCode(text, linkedCodes)
        if (pasted === null || pasted.refusal !== null) return
        requestPreview(pasted.code)
    }

    const handleConfirmRemove = () => {
        if (!hasLoaded || isSaving || removingCode === null) return
        save(
            toAutojoinValue(
                autojoinSpaces.filter(code => code !== removingCode),
            ),
        )
    }

    const handleOpenPaste = () => {
        setSelectedCode(null)
        setSheet('paste')
    }
    const clearRemovingCode = () => setRemovingCode(null)

    // derived each render, so a save that links the code turns it into a
    // duplicate without another keystroke
    const candidate = classifyPastedCode(pasteText, linkedCodes)
    const candidatePreview = candidate ? previews[candidate.code] : undefined

    const fullNote = getFullNote(t, linkedCodes.size)
    const overLimitNote = getOverLimitNote(t, linkedCodes.size)
    const handleOpenAdd = () =>
        setSheet(getAddEntrySheet(createdCommunities.length))

    const style = styles(theme)

    return (
        <SafeScrollArea edges="notop" padding="lg">
            <Column gap="lg" grow>
                <Text caption style={style.lead}>
                    {t('feature.wallet-service.settings-autojoin-lead')}
                </Text>

                {failedSave && (
                    <FailedSaveBanner
                        failedSave={failedSave}
                        isSaving={isSaving}
                        onRetry={save}
                    />
                )}

                <AutojoinSpacesBody
                    hasFailed={hasFailed}
                    onRetry={refresh}
                    codes={autojoinSpaces}
                    previews={previews}
                    isSaving={isSaving}
                    overLimitNote={overLimitNote}
                    onRemove={setRemovingCode}
                />
            </Column>

            <Button
                fullWidth
                testID="autojoin-add"
                icon={
                    <SvgImage
                        name="Plus"
                        size="sm"
                        color={theme.colors.secondary}
                    />
                }
                title={t('feature.wallet-service.settings-autojoin-add')}
                disabled={isSaving || isFull}
                onPress={handleOpenAdd}
            />

            <AddSpaceSheet
                show={sheet === 'add'}
                isSaving={isSaving}
                hasLoaded={hasLoaded}
                isFull={isFull}
                fullNote={fullNote}
                communities={createdCommunities}
                linkedCodes={linkedCodes}
                selectedCode={selectedCode}
                onSelect={setSelectedCode}
                onAdd={addCode}
                onPaste={handleOpenPaste}
                onDismiss={closeSheet}
            />

            <PasteSpaceSheet
                show={sheet === 'paste'}
                isSaving={isSaving}
                hasLoaded={hasLoaded}
                isFull={isFull}
                fullNote={fullNote}
                text={pasteText}
                candidate={candidate}
                candidatePreview={candidatePreview}
                onChangeText={handlePasteTextChange}
                onAdd={addCode}
                onDismiss={closeSheet}
            />

            <RemoveSpaceSheet
                show={removingCode !== null}
                isSaving={isSaving}
                hasLoaded={hasLoaded}
                onConfirm={handleConfirmRemove}
                onDismiss={clearRemovingCode}
            />
        </SafeScrollArea>
    )
}

/** Back and the screen label, like the settings header. */
export const WalletServiceAutojoinSpacesHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1}>
                    {t('feature.wallet-service.settings-autojoin')}
                </Text>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        lead: {
            color: theme.colors.darkGrey,
        },
        empty: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xl,
        },
        count: {
            color: theme.colors.darkGrey,
            textAlign: 'right',
        },
        row: {
            paddingHorizontal: 14,
            paddingVertical: 15,
            width: '100%',
        },
        rowName: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '600',
        },
        rowDetail: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
        sheetCard: {
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            overflow: 'hidden',
        },
        field: {
            borderColor: theme.colors.lightGrey,
            borderRadius: 14,
            borderWidth: 1,
            color: theme.colors.primary,
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        fieldError: {
            borderColor: theme.colors.red,
        },
        found: {
            color: theme.colors.green,
        },
        refused: {
            color: theme.colors.red,
        },
    })

export default WalletServiceAutojoinSpaces
