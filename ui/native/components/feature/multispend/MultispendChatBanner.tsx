import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { Row, Column } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
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
        if (multispendStatus?.status === 'activeInvitation') {
            if (multispendStatus.state.rejections.length > 0) {
                return (
                    <View style={[style.statusBadge, style.failedStatusBadge]}>
                        <Text small bold style={style.failedStatusBadgeText}>
                            {t('words.failed')}
                        </Text>
                    </View>
                )
            }

            return (
                <View style={[style.statusBadge, style.pendingStatusBadge]}>
                    <Text small bold style={style.pendingStatusBadgeText}>
                        {t('feature.multispend.waiting-for-approval')}
                    </Text>
                </View>
            )
        }

        if (multispendStatus?.status === 'finalized') {
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
            <GradientView variant="sky-banner" style={style.container}>
                <Column gap="xs">
                    <Row align="center" gap="xs">
                        <SvgImage name="MultispendGroup" size={16} />
                        <Text caption bold>
                            {t('words.multispend')}
                        </Text>
                    </Row>
                    {statusBadge}
                </Column>
                <SvgImage name="ChevronRight" color={theme.colors.grey} />
            </GradientView>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
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
            backgroundColor: theme.colors.orange100,
        },
        pendingStatusBadgeText: {
            color: theme.colors.orange,
        },
        activeStatusBadge: {
            backgroundColor: theme.colors.green,
        },
        activeStatusBadgeText: {
            color: theme.colors.white,
        },
        failedStatusBadge: {
            backgroundColor: theme.colors.red100,
        },
        failedStatusBadgeText: {
            color: theme.colors.red,
        },
    })

export default MultispendChatBanner
