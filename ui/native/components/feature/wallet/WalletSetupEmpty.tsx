import {
    Button,
    Image,
    Text,
    Tooltip,
    useTheme,
    type Theme,
} from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native'

import { useAutoSelectFederations } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'

import { Images } from '../../../assets/images'
import type { RootStackParamList } from '../../../types/navigation'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

const WALLET_SERVICE_URL = 'https://www.fedi.xyz/create-a-wallet-service'

interface Props {
    navigation: {
        navigate<K extends keyof RootStackParamList>(
            screen: K,
            params?: RootStackParamList[K],
        ): void
    }
}

const WalletSetupEmpty: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const [tooltipOpen, setTooltipOpen] = useState(false)
    const { pickRandom } = useAutoSelectFederations()

    const handleAutoSelect = useCallback(() => {
        const selected = pickRandom()
        if (!selected) {
            toast.show({
                content: t('errors.failed-to-select-wallet-service'),
                status: 'error',
            })
            return
        }

        navigation.navigate('JoinFederation', {
            invite: selected.meta.invite_code,
        })
    }, [pickRandom, navigation, toast, t])

    const handleManualSetup = useCallback(() => {
        navigation.navigate('PublicFederations')
    }, [navigation])

    const style = styles(theme)

    return (
        <ScrollView
            contentContainerStyle={style.setupContainer}
            alwaysBounceVertical={false}>
            <Column grow center gap="md" fullWidth>
                <Image
                    resizeMode="contain"
                    source={Images.HoloWallet}
                    style={{ width: 80, height: 80 }}
                    width={80}
                    height={80}
                />
                <Row align="center" gap="xs" justify="center">
                    <Text h2 medium style={style.setupTitle}>
                        {t('feature.wallet.setup-title')}
                    </Text>
                    <Tooltip
                        visible={tooltipOpen}
                        onClose={() => setTooltipOpen(false)}
                        onOpen={() => setTooltipOpen(true)}
                        closeOnlyOnBackdropPress
                        withOverlay
                        overlayColor={theme.colors.overlay}
                        width={240}
                        height={80}
                        backgroundColor={theme.colors.blue100}
                        popover={
                            <Text caption>
                                {t('feature.wallet.setup-tooltip-before-link')}
                                <Text
                                    caption
                                    style={style.tooltipLink}
                                    onPress={() => {
                                        setTooltipOpen(false)
                                        navigation.navigate('FediModBrowser', {
                                            url: WALLET_SERVICE_URL,
                                        })
                                    }}>
                                    {t('feature.wallet.setup-tooltip-link')}
                                </Text>
                                {t('feature.wallet.setup-tooltip-after-link')}
                            </Text>
                        }>
                        <TouchableOpacity
                            onPress={() => setTooltipOpen(true)}
                            hitSlop={8}>
                            <SvgImage
                                name="Help"
                                size={24}
                                color={theme.colors.darkGrey}
                            />
                        </TouchableOpacity>
                    </Tooltip>
                </Row>

                <Button
                    onPress={handleAutoSelect}
                    fullWidth
                    testID="AutoSelectButton">
                    {t('feature.wallet.setup-auto-select')}
                </Button>

                <Text caption style={style.setupOr}>
                    {t('feature.wallet.setup-or')}
                </Text>

                <Button
                    day
                    onPress={handleManualSetup}
                    fullWidth
                    containerStyle={style.manualSetupButton}
                    testID="ManualSetupButton">
                    <Text medium>{t('feature.wallet.setup-manual')}</Text>
                </Button>
            </Column>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        setupContainer: {
            flexGrow: 1,
            padding: theme.spacing.lg,
            justifyContent: 'center',
        },
        setupTitle: {
            fontSize: 20,
            textAlign: 'center',
            marginVertical: theme.spacing.sm,
        },
        setupOr: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
        tooltipLink: {
            color: theme.colors.link,
            textDecorationLine: 'underline',
        },
        manualSetupButton: {
            borderColor: theme.colors.lightGrey,
            borderWidth: 1.5,
        },
    })

export default WalletSetupEmpty
