import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectPaymentFederation,
    selectWalletFederations,
    setPayFromFederationId,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { LoadedFederation, MSats } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'

const FederationWalletSelector: React.FC<{ readonly?: boolean }> = ({
    readonly = false,
}) => {
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
                style={style.tileContainer}
                onPress={() => handleFederationSelected(f)}>
                <FederationLogo federation={f} size={32} />
                <View style={style.tileTextContainer}>
                    <Text bold numberOfLines={1}>
                        {f?.name || ''}
                    </Text>
                    <Text style={{}}>
                        {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                    </Text>
                </View>
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
        <View style={style.container}>
            <Pressable
                style={style.selectedFederation}
                onPress={() => setOpened(true)}
                disabled={readonly}>
                <FederationLogo federation={paymentFederation} size={32} />
                <View style={style.tileTextContainer}>
                    <Text caption bold numberOfLines={1}>
                        {paymentFederation?.name || ''}
                    </Text>
                    <Text
                        style={{ color: theme.colors.darkGrey }}
                        medium
                        caption
                        numberOfLines={1}>
                        {`${primaryAmountToSendFrom} (${secondaryAmountToSendFrom})`}
                    </Text>
                </View>
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
                        <View style={style.federationsList}>
                            {federations.map(renderFederation)}
                        </View>
                    ),
                }}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            alignItems: 'center',
        },
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
        federationsList: {
            paddingTop: theme.spacing.md,
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
            flexDirection: 'column',
            gap: theme.spacing.xs,
            maxWidth: '60%',
        },
    })

export default FederationWalletSelector
