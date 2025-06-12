import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import HoloGradient from '../../ui/HoloGradient'
import SvgImage from '../../ui/SvgImage'

type Props = {
    roomId: string
}

const MultispendChatBanner: React.FC<Props> = ({ roomId }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const style = styles(theme)

    const statusBadge = useMemo(() => {
        switch (multispendStatus?.status) {
            case 'activeInvitation':
                return (
                    <View style={[style.statusBadge, style.pendingStatusBadge]}>
                        <Text small bold style={style.pendingStatusBadgeText}>
                            {t('feature.multispend.waiting-for-approval')}
                        </Text>
                    </View>
                )
            case 'finalized':
                return (
                    <View style={[style.statusBadge, style.activeStatusBadge]}>
                        <Text small bold style={style.activeStatusBadgeText}>
                            {t('words.active')}
                        </Text>
                    </View>
                )
        }
        return null
    }, [multispendStatus, t, style])

    return (
        <Pressable
            onPress={() => navigation.navigate('GroupMultispend', { roomId })}>
            <HoloGradient
                style={style.container}
                gradientStyle={style.contentContainer}
                level="m500">
                <Flex gap="xs">
                    <Flex row align="center" gap="xs">
                        <SvgImage name="MultispendGroup" size={16} />
                        <Text caption bold>
                            {t('words.multispend')}
                        </Text>
                    </Flex>
                    {statusBadge}
                </Flex>
                <SvgImage name="ChevronRight" color={theme.colors.grey} />
            </HoloGradient>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
        },
        contentContainer: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: theme.spacing.lg,
        },
        statusBadge: {
            borderRadius: 4,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            alignSelf: 'flex-start',
        },
        pendingStatusBadge: {
            color: theme.colors.primary,
            backgroundColor: theme.colors.orange100,
        },
        pendingStatusBadgeText: {
            color: theme.colors.orange,
        },
        activeStatusBadge: {
            color: theme.colors.primary,
            backgroundColor: theme.colors.green,
        },
        activeStatusBadgeText: {
            color: theme.colors.white,
        },
    })

export default MultispendChatBanner
