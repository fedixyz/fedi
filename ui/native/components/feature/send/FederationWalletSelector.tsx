import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import {
    selectPaymentFederation,
    selectLoadedFederations,
    setPayFromFederationId,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { LoadedFederation } from '../../../types'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import SelectFederationOverlay from './SelectFederationOverlay'

const FederationWalletSelector: React.FC<{
    readonly?: boolean
    fullWidth?: boolean
    showBalance?: boolean
}> = ({ readonly = false, fullWidth = false, showBalance = true }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const [opened, setOpened] = useState<boolean>(false)
    const style = styles(theme)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federations = useAppSelector(selectLoadedFederations)

    const { formattedBalance } = useBalance(t, paymentFederation?.id || '')

    const handleFederationSelected = useCallback(
        (fed: LoadedFederation) => {
            dispatch(setPayFromFederationId(fed.id))
        },
        [dispatch],
    )

    if (federations.length === 0) return null

    return (
        <Column align="center" fullWidth testID="federation-wallet-selector">
            <Pressable
                style={[
                    style.selectedFederation,
                    fullWidth ? { width: '100%' } : {},
                ]}
                onPress={() => setOpened(true)}
                disabled={readonly}>
                <FederationLogo federation={paymentFederation} size={32} />
                <Column gap="xs" style={style.tileTextContainer}>
                    <Text caption bold numberOfLines={1}>
                        {paymentFederation?.name || ''}
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
                {readonly ? null : (
                    <SvgImage
                        name="ChevronRight"
                        size={SvgImageSize.sm}
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
                onSelect={handleFederationSelected}
                selectedFederation={paymentFederation?.id}
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
