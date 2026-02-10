import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { Button, Text, useTheme, type Theme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import {
    selectLoadedFederations,
    selectNonFeaturedFederations,
} from '@fedi/common/redux'

import FeaturedFederation from '../components/feature/federations/FeaturedFederation'
import FederationTile from '../components/feature/federations/FederationTile'
import { Column } from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import { resetToJoinFederation } from '../state/navigation'
import type {
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Federations'
>

const Federations: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const [expandedWalletId, setExpandedWalletId] = useState<string | null>(
        null,
    )

    // the featured federation is displayed in the FederationsHeader instead to fit in the gradient background
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const federations = useAppSelector(selectNonFeaturedFederations)

    const style = styles(theme)

    if (loadedFederations.length === 0) {
        return (
            <Column grow center style={style.empty} gap="md">
                <Column
                    align="center"
                    gap="md"
                    fullWidth
                    style={style.emptyContainer}>
                    <Text bold>{t('feature.federations.no-federations')}</Text>
                    <Text caption>{t('feature.wallet.join-federation')}</Text>
                </Column>
                <Button
                    onPress={() => navigation.dispatch(resetToJoinFederation())}
                    fullWidth>
                    {t('phrases.join-a-federation')}
                </Button>
            </Column>
        )
    }

    return (
        <ScrollView
            contentContainerStyle={style.container}
            alwaysBounceVertical={false}>
            <Column fullWidth>
                <FeaturedFederation />
                {federations.length > 0 && (
                    <View style={style.tileContainer}>
                        <View style={style.divider} />
                    </View>
                )}
                {federations.map((federation, idx) => (
                    <View key={federation.id} style={style.tileContainer}>
                        <FederationTile
                            federation={federation}
                            expanded={expandedWalletId === federation.id}
                            setExpandedWalletId={setExpandedWalletId}
                        />
                        {idx < federations.length - 1 && (
                            <View style={style.divider} />
                        )}
                    </View>
                ))}
            </Column>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            marginTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xl,
            width: '100%',
        },
        tileContainer: {
            paddingHorizontal: theme.spacing.lg,
        },
        divider: {
            height: 1,
            width: '100%',
            backgroundColor: theme.colors.dividerGrey,
            marginVertical: theme.spacing.xl,
        },
        empty: {
            paddingHorizontal: theme.spacing.lg,
        },
        emptyContainer: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderColor: theme.colors.lightGrey,
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: 'dashed',
        },
    })

export default Federations
