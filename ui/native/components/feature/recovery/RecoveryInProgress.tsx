import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { selectActiveFederationId } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import HoloLoader from '../../ui/HoloLoader'

export type Props = {
    label?: string
}

const log = makeLog('recovery')

const RecoveryInProgress: React.FC<Props> = ({ label }: Props) => {
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederationId)
    const [progress, setProgress] = useState<number | undefined>(undefined)

    useEffect(() => {
        return fedimint.addListener('recoveryProgress', event => {
            log.info('recovery progress', event)
            if (event.federationId === activeFederation) {
                if (event.total === 0) {
                    setProgress(undefined)
                } else {
                    setProgress(event.complete / event.total)
                }
            }
        })
    }, [activeFederation])

    const style = styles(theme)
    return (
        <View style={style.container}>
            <HoloLoader
                size={100}
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
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
            gap: theme.spacing.lg,
        },
        label: {
            textAlign: 'center',
        },
    })

export default RecoveryInProgress
