import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useWalletServiceLightningAttach } from '@fedi/common/hooks/fi'
import {
    getWalletServiceErrorKey,
    getWalletServiceRetryableError,
} from '@fedi/common/redux'

import { LightningAttachProgress } from '../components/feature/walletservice/LightningAttachProgress'
import { LightningBanner } from '../components/feature/walletservice/LightningProviderBanner'
import { LightningProviderPicker } from '../components/feature/walletservice/LightningProviderPicker'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Column } from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceLightningProvider'
>

/** This screen is the last of the 5 creation steps. */
const STEP_INDEX = 4

/**
 * Ask for a Lightning provider, as the last thing creation does.
 *
 * It ran before as a screen that discovered a provider and requested none, so
 * every Wallet Service was born without a gateway while settings claimed a
 * verified one was active.
 *
 * The card is a tick, and the tick is inert: it records an intention and makes
 * no call. Continue is the only thing that requests anything, which is what
 * makes leaving without a provider a decision rather than an accident.
 *
 * This step cannot move earlier. The bridge refuses the request unless the
 * formation is already formed and fresh, so the provider can only be asked for
 * once the federation exists.
 */
const WalletServiceLightningProvider: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { status, errorCode, isRetryable, stage, isRequesting, start } =
        useWalletServiceLightningAttach()

    // story 08 preselects the provider: the common case is accepting it, and
    // the user unticking is the deliberate act
    const [isSelected, setIsSelected] = useState(true)

    // the attach outlives a back press, so a late verification must not
    // navigate a user who has already left
    const isOnScreen = useRef(true)
    useFocusEffect(
        useCallback(() => {
            isOnScreen.current = true
            return () => {
                isOnScreen.current = false
            }
        }, []),
    )

    const goToDashboard = useCallback(
        () => navigation.navigate('WalletServiceDashboard'),
        [navigation],
    )

    // Only a request THIS screen made may carry the user onward. App-wide
    // state can also report `attached` for a provider attached in an earlier
    // session, and that is a state to render, not a reason to move someone who
    // has just arrived.
    //
    // Tracked on the request rather than on having seen `attaching`: an attach
    // that verifies immediately never passes through it, and that user has
    // still earned the same exit.
    const hasRequested = useRef(false)

    useEffect(() => {
        if (status !== 'attached') return
        if (!hasRequested.current) return
        if (!isOnScreen.current) return
        goToDashboard()
    }, [status, goToDashboard])

    const isAttaching = status === 'attaching'
    // the durable read has not answered, so Continue has nothing to act on yet
    const isCheckingGateway = status === 'unknown'
    // a provider attached in an earlier session, found by the durable read
    const isAttachedAlready = status === 'attached'

    const handleContinue = useCallback(() => {
        // once a request exists there is nothing left to ask for, so Continue
        // stops meaning "attach" and simply means "carry on" — the monitor
        // watches the rest wherever the user goes
        if (isAttaching || isAttachedAlready) return goToDashboard()
        // Continue means "attach this provider", so with nothing ticked there
        // is nothing for it to do. The CTA is disabled and Skip is the exit.
        if (!isSelected) return
        hasRequested.current = true
        start()
    }, [isSelected, isAttaching, isAttachedAlready, start, goToDashboard])

    const banner: LightningBanner | null =
        status === 'failed'
            ? {
                  tone: 'error',
                  message: isRetryable
                      ? getWalletServiceRetryableError(t, errorCode)
                      : t(getWalletServiceErrorKey(errorCode)),
              }
            : isAttaching
              ? {
                    // true the moment the request is accepted, not only after
                    // some budget elapses — so it is said then
                    tone: 'warn',
                    message: t(
                        'feature.wallet-service.lightning-still-setting-up',
                    ),
                }
              : null

    // a terminal failure has nothing to press: the provider cannot be attached
    // for this federation, so Skip is the only honest exit
    const hasPrimaryAction = !(status === 'failed' && !isRetryable)

    const primaryTitle =
        status === 'failed' && isRetryable
            ? t('words.retry')
            : t('words.continue')

    const style = styles(theme)

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t('feature.wallet-service.lightning-title')}
                step={STEP_INDEX}
            />
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg">
                    <LightningProviderPicker
                        isSelected={isAttachedAlready || isSelected}
                        // locked while the request runs, while the durable read
                        // is outstanding, and once a provider is attached:
                        // there is nothing to change in any of the three
                        onToggle={
                            isAttaching ||
                            isCheckingGateway ||
                            isRequesting ||
                            isAttachedAlready
                                ? undefined
                                : () => setIsSelected(current => !current)
                        }
                        isAttached={isAttachedAlready}
                        banner={banner}
                    />
                    {/* the wait is minutes, most of it in verification, so it
                        says which minute it is on rather than spinning */}
                    {isAttaching && stage && (
                        <LightningAttachProgress stage={stage} />
                    )}
                </Column>
            </SafeScrollArea>

            <WalletServiceFooter>
                {hasPrimaryAction && (
                    <Button
                        fullWidth
                        testID="lightning-continue"
                        title={primaryTitle}
                        onPress={handleContinue}
                        // nothing ticked means nothing to attach, so the CTA
                        // says so rather than accepting a press that only leaves
                        // never disabled while attaching: the request is
                        // already made, and this is now the way out of a screen
                        // nothing needs the user to stay on
                        disabled={
                            isCheckingGateway ||
                            isRequesting ||
                            (!isSelected && !isAttaching && !isAttachedAlready)
                        }
                        loading={isCheckingGateway || isRequesting}
                    />
                )}
                {/* skipping is a first-class path, not a dead end, so it is an
                    outlined pill like every other secondary action in the flow
                    rather than bare text */}
                {/* there is nothing left to skip once the request exists, so
                    it stands down rather than sitting there disabled */}
                {!isAttaching && !isAttachedAlready && (
                    <Button
                        fullWidth
                        type="outline"
                        testID="lightning-skip"
                        title={t('feature.wallet-service.lightning-skip')}
                        buttonStyle={style.skipButton}
                        titleStyle={style.skipTitle}
                        onPress={goToDashboard}
                    />
                )}
            </WalletServiceFooter>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        skipButton: {
            backgroundColor: 'transparent',
            // the design outlines secondary actions in grey, not ink — the
            // same pill `ServiceSheet` gives its non-primary buttons
            borderColor: theme.colors.lightGrey,
            borderRadius: 999,
            borderWidth: 1,
            paddingVertical: 14,
        },
        skipTitle: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
    })

export default WalletServiceLightningProvider
