import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import { Federation } from '@fedi/common/types'

import { Column } from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'

export type Props = {
    label?: string
    federationId?: Federation['id']
    size?: number
}

const RecoveryInProgress: React.FC<Props> = ({
    label,
    federationId = '',
    size = 100,
}: Props) => {
    const { theme } = useTheme()
    const { progress, formattedPercent } = useRecoveryProgress(federationId)

    const style = styles(theme)
    return (
        <Column grow center gap="lg" style={style.container}>
            <HoloLoader
                size={size}
                label={formattedPercent}
                progress={progress}
            />
            {label && (
                <Text medium style={style.label}>
                    {label}
                </Text>
            )}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
        },
        label: {
            textAlign: 'center',
        },
    })

export default RecoveryInProgress
