import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { supportsSafeOnchainDeposit } from '@fedi/common/redux'
import { Federation } from '@fedi/common/types'

import { useAppDispatch } from '../../../state/hooks'
import { Row, Column } from '../../ui/Flex'
import HoloAlert from '../../ui/HoloAlert'
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
        <Row align="center" gap="xs">
            <SvgImage
                name={icon}
                color={theme.colors.black}
                size={theme.sizes.md}
                containerStyle={style.icon}
            />
            <Column justify="center" gap="xs" grow shrink>
                <Text small bold color={theme.colors.darkGrey}>
                    {title}
                </Text>
                <Text small color={theme.colors.darkGrey}>
                    {subtitle}
                </Text>
            </Column>
            {right}
        </Row>
    )
}

type Props = {
    federationId: Federation['id']
}

const OnchainDepositInfo: React.FC<Props> = ({ federationId }) => {
    const [supportsSafeDeposit, setSupportsSafeOnchainDeposit] = useState(false)
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    const rows: Array<RowProps> = [
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
    ]

    if (!supportsSafeDeposit) {
        rows.push({
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
        })
    }

    useEffect(() => {
        dispatch(supportsSafeOnchainDeposit({ fedimint, federationId }))
            .unwrap()
            .then(setSupportsSafeOnchainDeposit)
    }, [dispatch, federationId, fedimint])

    return (
        <HoloAlert containerStyle={style.gradient}>
            <Column gap="md" style={style.content}>
                {rows.map((row, idx) => (
                    <InfoRow key={`info-row-onchain-${idx}`} {...row} />
                ))}
            </Column>
        </HoloAlert>
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
            padding: theme.spacing.md,
            borderRadius: 15,
            backgroundColor: theme.colors.white,
        },
        warningText: {
            color: theme.colors.red,
            textAlign: 'center',
        },
        textContainer: {
            alignSelf: 'stretch',
            textAlign: 'left',
        },
        icon: {
            padding: theme.spacing.sm,
            flexShrink: 0,
        },
        text: {
            lineHeight: 15,
        },
    })

export default OnchainDepositInfo
