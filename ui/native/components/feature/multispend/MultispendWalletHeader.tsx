import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import LinearGradient from 'react-native-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    useMultispendDisplayUtils,
    useMultispendVoting,
} from '@fedi/common/hooks/multispend'

import { fedimint } from '../../../bridge'
import { reset } from '../../../state/navigation'
import CustomOverlay from '../../ui/CustomOverlay'
import HoloCircle from '../../ui/HoloCircle'
import HoloGradient from '../../ui/HoloGradient'
import SvgImage from '../../ui/SvgImage'

type Props = {
    roomId: string
}

const MultispendWalletHeader: React.FC<Props> = ({ roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const navigation = useNavigation()
    const insets = useSafeAreaInsets()
    const {
        isProposer,
        isActive,
        isFinalized,
        isConfirmingAbort,
        setIsConfirmingAbort,
        abortConfirmationContents,
        rejectConfirmationContents,
        hasRejected,
    } = useMultispendVoting({
        t,
        fedimint,
        roomId,
        onMultispendAborted: () => {
            navigation.dispatch(reset('ChatRoomConversation', { roomId }))
        },
    })
    const {
        formattedMultispendBalance,
        selectedCurrency,
        walletHeader: { federationName, status, threshold, totalSigners },
    } = useMultispendDisplayUtils(t, roomId)

    const handleBack = useCallback(() => {
        navigation.dispatch(reset('ChatRoomConversation', { roomId }))
    }, [navigation, roomId])

    const handleInfoPress = useCallback(() => {
        Linking.openURL(
            'https://support.fedi.xyz/hc/en-us/articles/20019791912466-What-is-Multispend',
        )
    }, [])

    const actionButtons = (
        <>
            {isActive && !hasRejected ? (
                <Pressable onPress={() => setIsConfirmingAbort(true)}>
                    <Text style={style.abortText} medium>
                        {t(isProposer ? 'words.abort' : 'words.reject')}
                    </Text>
                </Pressable>
            ) : isFinalized && roomId ? (
                <Pressable
                    onPress={() =>
                        navigation.navigate('MultispendTransactions', {
                            roomId,
                        })
                    }>
                    <SvgImage name="List" size={24} />
                </Pressable>
            ) : null}
        </>
    )

    return (
        <HoloGradient style={style.container} level="m500">
            <View style={[style.header, { paddingTop: insets.top }]}>
                <View style={style.headerSecondary}>
                    <Pressable onPress={handleBack}>
                        <SvgImage name="ChevronLeft" size={24} />
                    </Pressable>
                </View>
                <View style={style.title}>
                    <Text medium>{t('words.multispend')}</Text>
                    <Pressable onPress={handleInfoPress}>
                        <SvgImage
                            name="Info"
                            size={16}
                            color={theme.colors.grey}
                        />
                    </Pressable>
                </View>
                <View
                    style={[
                        style.headerSecondary,
                        style.actionButtonsContainer,
                    ]}>
                    {actionButtons}
                </View>
            </View>
            <View style={style.walletPreviewContainer}>
                <LinearGradient
                    style={style.walletPreview}
                    colors={[
                        'rgba(255, 255, 255, 0.2)',
                        'rgba(255, 255, 255, 0)',
                    ]}>
                    <HoloCircle
                        size={40}
                        content={<SvgImage name="MultispendGroup" size={24} />}
                    />
                    <View style={style.walletInfo}>
                        <Text small bold style={style.infoText}>
                            {federationName}
                        </Text>
                        <View style={style.balance}>
                            <Text style={style.infoText} bold>
                                {formattedMultispendBalance}
                            </Text>
                            <Text small bold style={style.infoText}>
                                {selectedCurrency}
                            </Text>
                        </View>
                    </View>
                    <View style={style.statusContainer}>
                        <View style={[style.badge, style.pendingBadge]}>
                            <Text tiny bold>
                                {status}
                            </Text>
                        </View>
                        <View style={[style.badge]}>
                            <Text tiny bold>
                                {t('feature.multispend.x-n-votes-required', {
                                    x: threshold,
                                    n: totalSigners,
                                })}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>
            </View>
            <CustomOverlay
                show={isConfirmingAbort}
                onBackdropPress={() => setIsConfirmingAbort(false)}
                contents={
                    isProposer
                        ? abortConfirmationContents
                        : rejectConfirmationContents
                }
            />
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'column',
        },
        content: {
            display: 'flex',
            flexDirection: 'column',
        },
        header: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
        },
        title: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            flex: 2,
            flexBasis: 0,
        },
        abortText: {
            color: theme.colors.red,
        },
        headerSecondary: {
            flex: 1,
            flexBasis: 0,
        },
        actionButtonsContainer: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
        },
        walletPreviewContainer: {
            padding: theme.spacing.lg,
        },
        walletPreview: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.night,
            borderRadius: 20,
            padding: 20,
        },
        walletInfo: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xs,
            flex: 1,
            alignItems: 'flex-start',
        },
        balance: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: theme.spacing.xs,
        },
        statusContainer: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xs,
            alignItems: 'flex-end',
        },
        badge: {
            borderRadius: 4,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            backgroundColor: theme.colors.white,
        },
        pendingBadge: {
            color: theme.colors.orange,
            backgroundColor: theme.colors.orange100,
        },
        infoText: {
            color: theme.colors.white,
        },
    })

export default MultispendWalletHeader
