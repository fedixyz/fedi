import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { selectCurrency, selectLoadedFederations } from '@fedi/common/redux'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import { LoadedFederation, MSats } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'

const SelectFederationOverlay: React.FC<{
    opened: boolean
    onDismiss: () => void
    onSelect: (federation: LoadedFederation) => void
    selectedFederation: LoadedFederation['id'] | undefined
    showStableBalance?: boolean
}> = ({
    opened,
    onDismiss,
    onSelect,
    selectedFederation,
    showStableBalance = false,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const federations = useAppSelector(selectLoadedFederations)

    return (
        <CustomOverlay
            show={opened}
            onBackdropPress={onDismiss}
            contents={{
                title: t('phrases.select-federation'),
                body: (
                    <ScrollView
                        style={style.federationsListContainer}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={style.federationsList}>
                        {federations.map(f => (
                            <SelectFederationListItem
                                key={`federation-option-${f.id}`}
                                federation={f}
                                isSelected={selectedFederation === f.id}
                                handleFederationSelected={() => onSelect(f)}
                                showStableBalance={showStableBalance}
                            />
                        ))}
                    </ScrollView>
                ),
            }}
        />
    )
}

const SelectFederationListItem: React.FC<{
    federation: LoadedFederation
    isSelected: boolean
    handleFederationSelected: (f: LoadedFederation) => void
    showStableBalance: boolean
}> = ({
    federation,
    isSelected,
    handleFederationSelected,
    showStableBalance,
}) => {
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federation.id),
    )

    const { formattedStableBalance } = useStabilityPool(federation.id)

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId: federation.id,
    })

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(federation.balance || (0 as MSats))

    const { theme } = useTheme()

    const style = styles(theme)
    return (
        <Pressable
            key={`federation-option-${federation.id}`}
            style={style.tileContainer}
            onPress={() => handleFederationSelected(federation)}>
            <FederationLogo federation={federation} size={32} />
            <Column gap="xs" style={style.tileTextContainer}>
                <Text bold numberOfLines={1}>
                    {federation.name || ''}
                </Text>
                <Text style={{}}>
                    {showStableBalance
                        ? formattedStableBalance
                        : `${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                </Text>
            </Column>
            {isSelected && (
                <SvgImage
                    name="Check"
                    size={SvgImageSize.sm}
                    containerStyle={{
                        marginLeft: 'auto',
                    }}
                />
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        selectedFederation: {
            flexDirection: 'row',
            alignItems: 'center',
            width: 280,
            backgroundColor: theme.colors.offWhite100,
            borderRadius: 44,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            gap: 10,
        },
        federationsListContainer: {
            maxHeight: 400,
        },
        federationsList: {
            alignItems: 'flex-start',
            width: '100%',
        },
        tileContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: theme.spacing.md,
            gap: 12,
            width: '100%',
        },
        tileTextContainer: {
            maxWidth: '60%',
        },
    })

export default SelectFederationOverlay
