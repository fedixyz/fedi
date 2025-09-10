import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectPaymentFederation,
    selectWalletFederations,
    setPayFromFederationId,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { LoadedFederation, MSats } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'

const FederationWalletSelector: React.FC<{
    readonly?: boolean
    fullWidth?: boolean
    showBalance?: boolean
}> = ({ readonly = false, fullWidth = false, showBalance = true }) => {
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const [opened, setOpened] = useState<boolean>(false)
    const { t } = useTranslation()
    const style = styles(theme)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federations = useAppSelector(selectWalletFederations)

    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const {
        formattedPrimaryAmount: primaryAmountToSendFrom,
        formattedSecondaryAmount: secondaryAmountToSendFrom,
    } = makeFormattedAmountsFromMSats(
        paymentFederation?.balance || (0 as MSats),
    )

    const handleFederationSelected = useCallback(
        (fed: LoadedFederation) => {
            dispatch(setPayFromFederationId(fed.id))
        },
        [dispatch],
    )

    const renderFederation = (f: LoadedFederation) => {
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(f?.balance || (0 as MSats))
        return (
            <Pressable
                key={`federation-option-${f.id}`}
                style={style.tileContainer}
                onPress={() => handleFederationSelected(f)}>
                <FederationLogo federation={f} size={32} />
                <Flex gap="xs" style={style.tileTextContainer}>
                    <Text bold numberOfLines={1}>
                        {f?.name || ''}
                    </Text>
                    <Text style={{}}>
                        {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                    </Text>
                </Flex>
                {paymentFederation?.id === f.id && (
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

    if (federations.length === 0) return null

    return (
        <Flex align="center" fullWidth testID="federation-wallet-selector">
            <Pressable
                style={[
                    style.selectedFederation,
                    fullWidth ? { width: '100%' } : {},
                ]}
                onPress={() => setOpened(true)}
                disabled={readonly}>
                <FederationLogo federation={paymentFederation} size={32} />
                <Flex gap="xs" style={style.tileTextContainer}>
                    <Text caption bold numberOfLines={1}>
                        {paymentFederation?.name || ''}
                    </Text>
                    {showBalance && (
                        <Text
                            style={{ color: theme.colors.darkGrey }}
                            medium
                            caption
                            numberOfLines={1}>
                            {`${primaryAmountToSendFrom} (${secondaryAmountToSendFrom})`}
                        </Text>
                    )}
                </Flex>
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
            <CustomOverlay
                show={opened}
                onBackdropPress={() => setOpened(false)}
                contents={{
                    title: t('phrases.select-federation'),
                    body: (
                        <ScrollView
                            style={style.federationsListContainer}
                            contentContainerStyle={style.federationsList}>
                            {federations.map(renderFederation)}
                        </ScrollView>
                    ),
                }}
            />
        </Flex>
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

export default FederationWalletSelector
