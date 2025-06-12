import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'

import { selectActiveFederationId } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'

export type Props = {
    label?: string
    federationId?: string
    size?: number
}

const log = makeLog('recovery')

const RecoveryInProgress: React.FC<Props> = ({
    label,
    federationId,
    size = 100,
}: Props) => {
    const { theme } = useTheme()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const [progress, setProgress] = useState<number | undefined>(undefined)

    const federationIdToUse = federationId || activeFederationId

    useEffect(() => {
        return fedimint.addListener('recoveryProgress', event => {
            log.info('recovery progress', event)
            if (event.federationId === federationIdToUse) {
                if (event.total === 0) {
                    setProgress(undefined)
                } else {
                    setProgress(event.complete / event.total)
                }
            }
        })
    }, [federationIdToUse])

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
