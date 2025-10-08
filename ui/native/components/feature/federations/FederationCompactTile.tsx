import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'

import Flex from '../../ui/Flex'
import { FederationLogo } from './FederationLogo'

const FederationCompactTile: React.FC<{
    federation?: Pick<LoadedFederation, 'id' | 'meta' | 'name'>
    isLoading?: boolean
}> = ({ federation, isLoading }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex gap="md">
            <View style={style.tileContainer}>
                {isLoading ? (
                    <ActivityIndicator />
                ) : (
                    <>
                        <FederationLogo federation={federation} size={32} />
                        {federation?.name && (
                            <Text color={theme.colors.secondary}>
                                {federation.name}
                            </Text>
                        )}
                    </>
                )}
            </View>
        </Flex>
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
