import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'

import { Column } from '../../ui/Flex'
import { FederationLogo } from './FederationLogo'

const FederationCompactTile: React.FC<{
    federation?: Pick<LoadedFederation, 'id' | 'meta' | 'name'>
    isLoading?: boolean
    textColor?: string
}> = ({ federation, isLoading, textColor }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Column gap="md">
            <View style={style.tileContainer}>
                {isLoading ? (
                    <ActivityIndicator />
                ) : (
                    <>
                        <FederationLogo federation={federation} size={32} />
                        {federation?.name && (
                            <Text color={textColor}>{federation.name}</Text>
                        )}
                    </>
                )}
            </View>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        tileContainer: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default FederationCompactTile
