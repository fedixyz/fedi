import Clipboard from '@react-native-clipboard/clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import { validate as validateBitcoinAddress } from 'bitcoin-address-validation'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Keyboard,
    ScrollView,
    StyleSheet,
} from 'react-native'

import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'
import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { selectIsInternetUnreachable } from '@fedi/common/redux'
import { parseUserInput } from '@fedi/common/utils/parser'
import { isValidInternetIdentifier } from '@fedi/common/utils/validation'

import FederationBalance from '../components/feature/federations/FederationBalance'
import { OmniInput } from '../components/feature/omni/OmniInput'
import AmountInput from '../components/ui/AmountInput'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { Column } from '../components/ui/Flex'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { Pressable } from '../components/ui/Pressable'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { AnyParsedData, ParserDataType, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'Send'>

type Tab = 'lightning' | 'onchain' | 'ecash'

// Expected input types for the Send screen
const expectedSendTypes = [
    ParserDataType.Bolt11,
    ParserDataType.LnurlPay,
    ParserDataType.FediChatUser,
    ParserDataType.Bip21,
    ParserDataType.BitcoinAddress,
] as const

type ExpectedSendType = Extract<
    AnyParsedData,
    { type: (typeof expectedSendTypes)[number] }
>

const Send: React.FC<Props> = ({ navigation, route }: Props) => {
    const { federationId = '' } = route.params

    const [address, setAddress] = useState('')
    const [addressFocused, setLightningAddressFocused] = useState(false)
    const [tab, setTab] = useState<Tab>('lightning')
    const [offlineAmount, setOfflineAmount] = useState<Sats>(0 as Sats)
    const [offlineSubmitAttempts, setOfflineSubmitAttempts] = useState(0)
    const [offlineNotes, setOfflineNotes] = useState('')
    const [isParsingAddress, setIsParsingAddress] = useState(false)

    const { t } = useTranslation()
    const { theme } = useTheme()
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount({
        ecashRequest: {},
    })

    const isOfflineWalletSupported = useIsOfflineWalletSupported(federationId)
    const isInternetUnreachable = useAppSelector(selectIsInternetUnreachable)
    const fedimint = useFedimint()
    const toast = useToast()

    const style = styles(theme)

    const onOfflineNext = useCallback(() => {
        setOfflineSubmitAttempts(attempts => attempts + 1)
        if (offlineAmount < minimumAmount || offlineAmount > maximumAmount) {
            return
        }
        navigation.navigate('ConfirmSendEcash', {
            amount: offlineAmount,
            notes: offlineNotes,
        })
    }, [maximumAmount, minimumAmount, navigation, offlineAmount, offlineNotes])

    const onExpectedInput = useCallback(
        (parsedData: ExpectedSendType) => {
            if (parsedData.type === ParserDataType.FediChatUser) {
                navigation.navigate('ChatWallet', {
                    recipientId: parsedData.data.id,
                })
            } else if (
                parsedData.type === ParserDataType.Bip21 ||
                parsedData.type === ParserDataType.BitcoinAddress
            ) {
                navigation.navigate('SendOnChainAmount', {
                    parsedData,
                })
            } else {
                navigation.navigate('ConfirmSendLightning', {
                    parsedData,
                })
            }
        },
        [navigation],
    )

    const handleParseData = useCallback(
        async (data: string) => {
            setIsParsingAddress(true)
            try {
                const parsedData = await parseUserInput(
                    data,
                    fedimint,
                    t,
                    federationId,
                    isInternetUnreachable,
                )

                if (expectedSendTypes.find(type => type === parsedData.type)) {
                    onExpectedInput(parsedData as ExpectedSendType)
                } else if (parsedData.type === ParserDataType.Unknown) {
                    toast.error(t, parsedData.data.message)
                }
            } catch (err) {
                toast.error(t, err)
            } finally {
                setAddress(data)
                setIsParsingAddress(false)
            }
        },
        [
            fedimint,
            t,
            isInternetUnreachable,
            federationId,
            onExpectedInput,
            toast,
        ],
    )

    const shouldShowAddress = useMemo(() => {
        if (!address) return false

        if (tab === 'lightning') {
            return isValidInternetIdentifier(address)
        }

        return validateBitcoinAddress(address)
    }, [tab, address])

    const content = useMemo(() => {
        if (tab === 'ecash') {
            return (
                <SafeAreaContainer edges="bottom">
                    <ScrollView
                        style={style.offlineScrollView}
                        contentContainerStyle={style.offlineScrollContainer}>
                        <Column grow gap="lg">
                            <FederationBalance federationId={federationId} />
                            <AmountInput
                                amount={offlineAmount}
                                minimumAmount={minimumAmount}
                                maximumAmount={maximumAmount}
                                onChangeAmount={setOfflineAmount}
                                submitAttempts={offlineSubmitAttempts}
                                verb={t('words.send')}
                                notes={offlineNotes}
                                setNotes={setOfflineNotes}
                                federationId={federationId}
                            />
                        </Column>
                        <Button
                            title={t('words.next')}
                            onPress={onOfflineNext}
                        />
                    </ScrollView>
                </SafeAreaContainer>
            )
        }

        if (addressFocused || address) {
            return (
                <KeyboardAwareWrapper behavior="padding">
                    <SafeAreaContainer
                        edges="all"
                        padding="lg"
                        style={style.addressContainer}>
                        <Column grow style={style.addressContentContainer}>
                            {shouldShowAddress && (
                                <Column grow>
                                    <Text color={theme.colors.grey} caption>
                                        {tab === 'lightning'
                                            ? t('words.people')
                                            : t('phrases.bitcoin-address')}
                                    </Text>
                                    <Pressable
                                        containerStyle={style.addressItem}
                                        disabled={isParsingAddress}
                                        onPress={() =>
                                            handleParseData(address)
                                        }>
                                        <Avatar
                                            id={address}
                                            name={address}
                                            size={AvatarSize.md}
                                        />
                                        <Text
                                            ellipsizeMode="tail"
                                            bold
                                            numberOfLines={1}
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                            }}>
                                            {address}
                                        </Text>
                                        {isParsingAddress && (
                                            <ActivityIndicator />
                                        )}
                                    </Pressable>
                                </Column>
                            )}
                            <Button
                                testID="PasteButton"
                                fullWidth
                                day
                                icon={<SvgImage name="Clipboard" />}
                                title={t('feature.omni.action-paste')}
                                onPress={() =>
                                    Clipboard.getString().then(handleParseData)
                                }
                            />
                        </Column>
                    </SafeAreaContainer>
                </KeyboardAwareWrapper>
            )
        }

        return (
            <OmniInput
                expectedInputTypes={expectedSendTypes}
                onExpectedInput={onExpectedInput}
                onUnexpectedSuccess={() => null}
            />
        )
    }, [
        isParsingAddress,
        onExpectedInput,
        onOfflineNext,
        handleParseData,
        tab,
        address,
        addressFocused,
        federationId,
        offlineAmount,
        offlineNotes,
        offlineSubmitAttempts,
        shouldShowAddress,
        style,
        theme,
        t,
        minimumAmount,
        maximumAmount,
    ])

    useSyncCurrencyRatesOnFocus(federationId)

    const options: { label: string; value: Tab }[] = [
        { label: t('words.lightning'), value: 'lightning' },
        { label: t('words.onchain'), value: 'onchain' },
    ]

    if (isOfflineWalletSupported) {
        options.push({
            label: t('phrases.ecash-slash-offline'),
            value: 'ecash',
        })
    }

    return (
        <Column grow>
            <Column style={style.headControls} gap="lg">
                <Switcher<Tab>
                    options={options}
                    selected={tab}
                    onChange={setTab}
                />
                {tab !== 'ecash' && (
                    <Input
                        placeholder={t(
                            tab === 'lightning'
                                ? 'feature.send.enter-a-lightning-address'
                                : 'feature.send.enter-a-bitcoin-address',
                        )}
                        style={style.input}
                        containerStyle={style.inputContainer}
                        inputContainerStyle={[
                            style.inputContainerStyle,
                            addressFocused && style.inputFocused,
                        ]}
                        inputStyle={style.inputStyle}
                        value={address}
                        onChangeText={text => {
                            setAddress(text)
                            setIsParsingAddress(false)
                        }}
                        onFocus={() => setLightningAddressFocused(true)}
                        onBlur={() => setLightningAddressFocused(false)}
                        autoCapitalize="none"
                        rightIcon={
                            <PressableIcon
                                svgName="Close"
                                onPress={() => {
                                    setAddress('')
                                    setIsParsingAddress(false)
                                    Keyboard.dismiss()
                                }}
                            />
                        }
                    />
                )}
            </Column>
            <Column grow>{content}</Column>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        offlineScrollView: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
        offlineScrollContainer: {
            flexGrow: 1,
        },
        headControls: {
            paddingHorizontal: theme.spacing.lg,
        },
        inputContainer: {
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 0,
            paddingHorizontal: 0,
            margin: 0,
            height: 48,
        },
        input: {
            paddingHorizontal: 12,
        },
        inputFocused: {
            borderColor: theme.colors.primary,
        },
        inputContainerStyle: {
            borderWidth: 1.5,
            borderColor: theme.colors.lightGrey,
            borderRadius: 12,
            paddingHorizontal: 0,
        },
        inputStyle: {
            height: 48,
            fontSize: 16,
        },
        addressItem: {
            paddingVertical: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            width: '100%',
            overflow: 'hidden',
        },
        addressContainer: {
            width: '100%',
            flexGrow: 1,
        },
        addressContentContainer: {
            justifyContent: 'flex-end',
            paddingBottom: theme.spacing.lg,
        },
    })

export default Send
