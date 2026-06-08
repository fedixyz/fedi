import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { useWalletFederationSelection } from '@fedi/common/hooks/federation'

import { Column } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import SelectFederationOverlay from './SelectFederationOverlay'

const FederationWalletSelector: React.FC<{
    readonly?: boolean
    fullWidth?: boolean
    showBalance?: boolean
    allowedFederationIds?: string[]
}> = ({
    readonly = false,
    fullWidth = false,
    showBalance = true,
    allowedFederationIds,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [opened, setOpened] = useState<boolean>(false)
    const style = styles(theme)

    const {
        federations,
        visibleFederations,
        selectedFederation,
        selectFederation,
    } = useWalletFederationSelection(allowedFederationIds)

    const { formattedBalance } = useBalance(t, selectedFederation?.id || '')

    if (federations.length === 0) return null
    // No allowed federation overlap — let the caller handle the empty case
    // (the miniapp handler rejects before opening the overlay, so this is
    // really just a safety net).
    if (visibleFederations.length === 0) return null

    const lockedToSingle = visibleFederations.length === 1
    const isReadonly = readonly || lockedToSingle

    return (
        <Column align="center" fullWidth testID="federation-wallet-selector">
            <Pressable
                style={[
                    style.selectedFederation,
                    fullWidth ? { width: '100%' } : {},
                ]}
                onPress={() => setOpened(true)}
                disabled={isReadonly}>
                <FederationLogo federation={selectedFederation} size={32} />
                <Column gap="xs" style={style.tileTextContainer}>
                    <Text caption bold numberOfLines={1}>
                        {selectedFederation?.name || ''}
                    </Text>
                    {showBalance && (
                        <Text
                            style={{ color: theme.colors.darkGrey }}
                            medium
                            caption
                            numberOfLines={1}>
                            {formattedBalance}
                        </Text>
                    )}
                </Column>
                {isReadonly ? null : (
                    <SvgImage
                        name="ChevronRight"
                        size="sm"
                        containerStyle={{
                            transform: [{ rotate: '90deg' }],
                            marginLeft: 'auto',
                        }}
                    />
                )}
            </Pressable>
            <SelectFederationOverlay
                opened={opened}
                onDismiss={() => setOpened(false)}
                onSelect={fed => selectFederation(fed.id)}
                selectedFederation={selectedFederation?.id}
                allowedFederationIds={allowedFederationIds}
            />
        </Column>
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
        tileTextContainer: {
            maxWidth: '60%',
        },
    })

export default FederationWalletSelector
