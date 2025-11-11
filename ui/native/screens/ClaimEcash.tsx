import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { useParseEcash, useClaimEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { selectOnboardingCompleted } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../bridge'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import Flex, { Column, Row } from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { navigateToHome, resetToWallets } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'ClaimEcash'>

const ClaimEcash: React.FC<Props> = ({ navigation, route }) => {
    const { token } = route.params ?? {}

    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const [tosUrl, setTosUrl] = useState<string | null>(null)

    // If user has not onboarded yet, redirect to the Splash screen
    useEffect(() => {
        if (!token) return

        if (!onboardingCompleted) {
            return navigation.replace('Splash', { screen: 'ClaimEcash', token })
        }
    }, [navigation, onboardingCompleted, token])

    const {
        parseEcash,
        loading: validating,
        parsed: parsedEcash,
        ecashToken,
        federation,
    } = useParseEcash(fedimint)

    const {
        claimEcash,
        loading: claiming,
        claimed: ecashClaimed,
        isError: isClaimError,
    } = useClaimEcash(fedimint)

    // Validate ecash token on load
    useEffect(() => {
        if (!token) return

        parseEcash(token)
    }, [token, parseEcash])

    useEffect(() => {
        if (!federation?.meta) return

        setTosUrl(getFederationTosUrl(federation.meta))
    }, [federation])

    useEffect(() => {
        if (isClaimError) {
            toast.error(t, 'feature.ecash.claim-ecash-error')
        }
    }, [isClaimError, t, toast])

    if (!onboardingCompleted) return null

    let content: React.ReactElement | null = null
    let actions: React.ReactElement | null = null

    const style = styles(theme)

    if (validating) {
        content = (
            <Flex center grow>
                <HoloLoader size={60} />
            </Flex>
        )
    } else if (!parsedEcash) {
        content = (
            <>
                <SvgImage name="AlertWarningTriangle" size={48} />
                <Text h2>{t('feature.ecash.invalid-ecash-token')}</Text>
                <Text center>
                    {t('feature.ecash.invalid-ecash-token-description')}
                </Text>
            </>
        )
        actions = (
            <Button
                fullWidth
                loading={claiming}
                disabled={claiming}
                onPress={() => navigation.dispatch(navigateToHome())}>
                {t('words.cancel')}
            </Button>
        )
    } else if (ecashClaimed) {
        content = (
            <>
                <SvgImage name="Check" size={48} />
                <Text h2>{t('feature.ecash.ecash-claimed')}</Text>
                <Text center>
                    {t('feature.ecash.claim-ecash-success-description')}
                </Text>
            </>
        )
        actions = (
            <>
                <Button
                    fullWidth
                    onPress={() => navigation.dispatch(resetToWallets())}>
                    {t('feature.ecash.go-to-wallet')}
                </Button>
                <Button
                    fullWidth
                    type="clear"
                    onPress={() => navigation.dispatch(navigateToHome())}>
                    {t('phrases.maybe-later')}
                </Button>
            </>
        )
    } else {
        content = (
            <>
                <SvgImage name="Cash" size={48} />
                <Text h2>
                    {amountUtils.msatToSatString(parsedEcash.amount)} SATS
                </Text>
                <Text center>{t('feature.ecash.claim-ecash-description')}</Text>
            </>
        )

        actions = (
            <>
                {federation && (
                    <Column gap="md" style={{ marginBottom: theme.spacing.lg }}>
                        <Row style={style.federationWrapper} gap="md">
                            <FederationLogo federation={federation} size={32} />
                            <Column style={style.wrapperText} justify="center">
                                {parsedEcash?.federation_type ===
                                'notJoined' ? (
                                    <Text small style={style.wrapperTextDesc}>
                                        {t(
                                            'feature.ecash.adding-to-new-wallet',
                                            {
                                                federation_name:
                                                    federation.name,
                                            },
                                        )}
                                    </Text>
                                ) : (
                                    <Text small style={style.wrapperTextDesc}>
                                        {t(
                                            'feature.ecash.adding-to-existing-wallet',
                                            {
                                                federation_name:
                                                    federation.name,
                                            },
                                        )}
                                    </Text>
                                )}
                            </Column>
                        </Row>

                        {parsedEcash?.federation_type === 'notJoined' &&
                            tosUrl && (
                                <Hyperlink
                                    onPress={() => Linking.openURL(tosUrl)}
                                    linkStyle={style.linkText}>
                                    <Text small style={style.wrapperTextDesc}>
                                        {t('feature.ecash.terms-link', {
                                            tos_url: tosUrl,
                                        })}
                                    </Text>
                                </Hyperlink>
                            )}
                    </Column>
                )}

                <Button
                    fullWidth
                    loading={claiming}
                    disabled={claiming}
                    onPress={() => claimEcash(parsedEcash, ecashToken)}>
                    {t('feature.ecash.claim-ecash')}
                </Button>
                <Button
                    fullWidth
                    type="clear"
                    onPress={() => navigation.dispatch(navigateToHome())}>
                    {t('phrases.maybe-later')}
                </Button>
            </>
        )
    }

    return (
        <SafeScrollArea edges="notop">
            <Flex grow center gap={theme.spacing.sm}>
                {content}
            </Flex>
            <Flex fullWidth>{actions}</Flex>
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        federationWrapper: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: 8,
            padding: theme.spacing.sm,
        },
        wrapperText: {
            flex: 1,
        },
        wrapperTextDesc: {
            color: theme.colors.darkGrey,
        },
        linkText: { color: theme.colors.link },
    })

export default ClaimEcash
