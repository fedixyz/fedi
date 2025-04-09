import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import HoloGradient from '../../ui/HoloGradient'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

type RowProps = {
    icon: SvgImageName
    title: string
    subtitle: string
    right?: React.ReactNode
}

const TRANSACTION_SIZE_HELP_LINK =
    'https://support.fedi.xyz/hc/en-us/articles/21356514304914-Does-Fedi-support-on-chain-transactions'

const InfoRow = ({ icon, title, subtitle, right }: RowProps) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <View style={style.row}>
            <SvgImage
                name={icon}
                color={theme.colors.black}
                size={theme.sizes.md}
                containerStyle={style.icon}
            />
            <View style={style.textContainer}>
                <Text small bold color={theme.colors.darkGrey}>
                    {title}
                </Text>
                <Text small color={theme.colors.darkGrey}>
                    {subtitle}
                </Text>
            </View>
            {right}
        </View>
    )
}

const OnchainDepositInfo: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    const rows = [
        {
            icon: 'Network',
            title: t('feature.receive.receive-guidance-title-1'),
            subtitle: t('feature.receive.receive-guidance-subtitle-1'),
        },
        {
            icon: 'BitcoinCircle2',
            title: t('feature.receive.receive-guidance-title-2'),
            subtitle: t('feature.receive.receive-guidance-subtitle-2'),
        },
        {
            icon: 'Scale',
            title: t('feature.receive.receive-guidance-title-3'),
            subtitle: t('feature.receive.receive-guidance-subtitle-3'),
            right: (
                <Pressable
                    onPress={() => Linking.openURL(TRANSACTION_SIZE_HELP_LINK)}>
                    <SvgImage
                        name="Info"
                        color={theme.colors.darkGrey}
                        size={theme.sizes.small}
                        containerStyle={style.icon}
                    />
                </Pressable>
            ),
        },
    ] satisfies RowProps[]

    return (
        <HoloGradient
            level="900"
            style={style.gradientContainer}
            gradientStyle={style.gradient}>
            <View style={style.content}>
                {rows.map((row, idx) => (
                    <InfoRow key={`info-row-onchain-${idx}`} {...row} />
                ))}
            </View>
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        gradientContainer: {
            borderRadius: 15,
            alignSelf: 'stretch',
        },
        gradient: {
            padding: theme.spacing.xxs,
            borderRadius: 15,
        },
        content: {
            display: 'flex',
            flexDirection: 'column',
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
            borderRadius: 15,
            backgroundColor: theme.colors.white,
        },
        warningText: {
            color: theme.colors.red,
            textAlign: 'center',
        },
        row: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
        textContainer: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignSelf: 'stretch',
            textAlign: 'left',
            gap: theme.spacing.xs,
        },
        icon: {
            padding: theme.spacing.sm,
        },
        text: {
            lineHeight: 15,
        },
    })

export default OnchainDepositInfo
