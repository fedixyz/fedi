import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Platform, StatusBar, StyleSheet, View } from 'react-native'
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
import Flex from '../../ui/Flex'
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
        canVote,
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

    useEffect(() => {
        if (Platform.OS === 'android') {
            StatusBar.setBackgroundColor('transparent')
            StatusBar.setTranslucent(true)
            StatusBar.setBarStyle('dark-content')
        }
    }, [])

    const actionButtons = (
        <>
            {isActive && !hasRejected && canVote ? (
                <Pressable onPress={() => setIsConfirmingAbort(true)}>
                    <Text color={theme.colors.red} medium>
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
            <Flex
                row
                align="center"
                justify="between"
                style={{
                    paddingTop: insets.top,
                    paddingHorizontal: theme.spacing.lg,
                }}>
                <Flex grow basis={false}>
                    <Pressable onPress={handleBack}>
                        <SvgImage name="ChevronLeft" size={24} />
                    </Pressable>
                </Flex>
                <Flex row center gap="xs" basis={false} style={style.title}>
                    <Text medium>{t('words.multispend')}</Text>
                    <Pressable onPress={handleInfoPress}>
                        <SvgImage
                            name="Info"
                            size={16}
                            color={theme.colors.grey}
                        />
                    </Pressable>
                </Flex>
                <Flex row grow basis={false} justify="end">
                    {actionButtons}
                </Flex>
            </Flex>
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
                    <Flex grow align="start" gap="xs">
                        <Text small bold style={style.infoText}>
                            {federationName}
                        </Text>
                        <Flex row gap="xs" style={style.balance}>
                            <Text style={style.infoText} bold>
                                {formattedMultispendBalance}
                            </Text>
                            <Text small bold style={style.infoText}>
                                {selectedCurrency}
                            </Text>
                        </Flex>
                    </Flex>
                    <Flex align="end" gap="xs">
                        <View style={[style.badge, style.pendingBadge]}>
                            <Text tiny bold>
                                {status}
                            </Text>
                        </View>
                        <View style={style.badge}>
                            <Text tiny bold>
                                {t('feature.multispend.x-n-votes-required', {
                                    x: threshold,
                                    n: totalSigners,
                                })}
                            </Text>
                        </View>
                    </Flex>
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
        title: {
            flex: 2,
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
        balance: {
            alignItems: 'baseline',
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
