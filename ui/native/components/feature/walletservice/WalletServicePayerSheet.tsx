import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectCurrency,
    selectLoadedFederations,
    selectWalletServiceSelectionPreview,
} from '@fedi/common/redux'
import { LoadedFederation, MSats } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import { ServiceSheet } from './ServiceSheet'

/**
 * Which wallet pays for setup, on story 04.
 */
export const WalletServicePayerSheet: React.FC<{
    show: boolean
    onDismiss: () => void
    onSelect: (federation: LoadedFederation) => void
    allowedFederationIds: string[]
}> = ({ show, onDismiss, onSelect, allowedFederationIds }) => {
    const { t } = useTranslation()
    const federations = useAppSelector(selectLoadedFederations)
    const preview = useAppSelector(selectWalletServiceSelectionPreview)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({})

    // Only wallets the bridge admits as payers, never the whole wallet list.
    //
    // Best funded first: the reason to open this sheet is that the selected
    // wallet cannot cover the cost, so the one most likely to belongs at the
    // top rather than buried under empty ones.
    const payers = useMemo(
        () =>
            federations
                .filter(f => allowedFederationIds.includes(f.id))
                .sort((a, b) => b.balance - a.balance),
        [federations, allowedFederationIds],
    )

    // the design says "21,000 sats", not the display default's "21,000 SATS"
    const total = preview
        ? makeFormattedAmountsFromMSats(
              Number(preview.totalAdvertisedMsats) as MSats,
          ).formattedSats.toLowerCase()
        : ''

    return (
        <ServiceSheet
            show={show}
            onDismiss={onDismiss}
            showClose
            title={t('feature.wallet-service.select-payer-title')}
            description={t('feature.wallet-service.select-payer-subtitle', {
                amount: total,
            })}
            buttons={[]}>
            <Column gap="sm" fullWidth>
                {payers.map(federation => (
                    <PayerOption
                        key={federation.id}
                        federation={federation}
                        onSelect={onSelect}
                    />
                ))}
            </Column>
        </ServiceSheet>
    )
}

const PayerOption: React.FC<{
    federation: LoadedFederation
    onSelect: (federation: LoadedFederation) => void
}> = ({ federation, onSelect }) => {
    const { theme } = useTheme()
    const currency = useAppSelector(s => selectCurrency(s, federation.id))
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency,
        federationId: federation.id,
    })

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(
            federation.balance || (0 as MSats),
            'end',
            true,
        )

    const style = styles(theme)

    return (
        <Pressable
            testID={`WalletServicePayerOption-${federation.id}`}
            style={style.option}
            onPress={() => onSelect(federation)}>
            <Row align="center" gap="md">
                <FederationLogo federation={federation} size={40} />
                <Column gap="xs" grow basis={false}>
                    <Text medium numberOfLines={1} style={style.name}>
                        {federation.name || ''}
                    </Text>
                    <Text
                        numberOfLines={1}
                        color={theme.colors.darkGrey}
                        style={style.balance}>
                        {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                    </Text>
                </Column>
                <SvgImage
                    name="ChevronRight"
                    size="sm"
                    color={theme.colors.grey}
                />
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        balance: {
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 18,
        },
        name: {
            fontSize: fediTheme.fontSizes.body,
            lineHeight: 20,
        },
        // `.src-row`: white, radius 16, 1px hairline, padding 14
        option: {
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 16,
            borderWidth: 1,
            padding: 14,
            width: '100%',
        },
    })
