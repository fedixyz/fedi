import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { useRecoveryProgress } from '@fedi/common/hooks/recovery'

import { fedimint } from '../../../bridge'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'

export type Props = {
    label?: string
    federationId?: string
    size?: number
}

const RecoveryInProgress: React.FC<Props> = ({
    label,
    federationId,
    size = 100,
}: Props) => {
    const { theme } = useTheme()
    const { progress } = useRecoveryProgress(fedimint, federationId)

    const style = styles(theme)
    return (
        <Flex grow center gap="lg" style={style.container}>
            <HoloLoader
                size={size}
                label={
                    progress !== undefined
                        ? `${Math.floor(progress * 100)}%`
                        : ''
                }
                progress={progress}
            />
            {label && (
                <Text medium style={style.label}>
                    {label}
                </Text>
            )}
        </Flex>
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
