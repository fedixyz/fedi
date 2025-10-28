import { useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { selectLastUsedFederation } from '@fedi/common/redux/federation'

import { useAppSelector } from '../../../state/hooks'
import FederationTile from './FederationTile'

const FeaturedFederation: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)
    const lastUsedFederation = useAppSelector(selectLastUsedFederation)

    return (
        <View style={style.container}>
            {lastUsedFederation && (
                <FederationTile
                    federation={lastUsedFederation}
                    expanded
                    setExpandedWalletId={() => {}}
                />
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
            padding: theme.spacing.lg,
            width: '100%',
            backgroundColor: theme.colors.secondary,
        },
    })

export default FeaturedFederation
