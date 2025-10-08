import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme, Text, Button, Input } from '@rneui/themed'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectDoesFederationHaveMultispend,
    selectPaymentFederation,
    selectLoadedFederations,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import Flex from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import { ChatType } from '../types'
import { RootStackParamList } from '../types/navigation'

const log = makeLog('CreateMultispend')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CreateMultispend'
>

const CreateMultispend: React.FC<Props> = ({ navigation, route }) => {
    const [approvalThreshold, setApprovalThreshold] = useState<string>('')
    const [approvalThresholdError, setApprovalThresholdError] = useState<
        string | undefined
    >(undefined)
    const [federationError, setFederationError] = useState<string | undefined>(
        undefined,
    )
    const [isLoading, setIsLoading] = useState(false)

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federations = useAppSelector(selectLoadedFederations)
    const doesPaymentFederationHaveMultispend = useAppSelector(s =>
        selectDoesFederationHaveMultispend(s, paymentFederation?.id ?? ''),
    )
    const { roomId, voters } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()

    const handleAssignVoters = useCallback(() => {
        navigation.navigate('AssignMultispendVoters', {
            roomId,
            voters,
        })
    }, [navigation, roomId, voters])

    const areVotersSufficient = (
        possibleVoters: string[] | undefined,
    ): possibleVoters is string[] => {
        return Array.isArray(possibleVoters) && possibleVoters.length >= 2
    }

    const canSubmit = useMemo(() => {
        const thresholdNumber = Number(approvalThreshold)

        if (!doesPaymentFederationHaveMultispend) {
            setFederationError(
                t('feature.multispend.federation-does-not-support-multispend'),
            )

            return false
        }

        setFederationError(undefined)

        if (
            !areVotersSufficient(voters) ||
            isNaN(thresholdNumber) ||
            thresholdNumber === 0
        )
            return false

        if (thresholdNumber > 6) {
            setApprovalThresholdError(
                t('feature.multispend.max-threshold-n', { n: 6 }),
            )

            return false
        }

        if (areVotersSufficient(voters) && thresholdNumber > voters.length) {
            setApprovalThresholdError(
                t('feature.multispend.max-threshold-n', { n: voters.length }),
            )

            return false
        }

        setApprovalThresholdError(undefined)

        return true
    }, [approvalThreshold, voters, doesPaymentFederationHaveMultispend, t])

    const handleSubmit = useCallback(async () => {
        const thresholdNumber = Number(approvalThreshold)

        if (!canSubmit || !voters || !paymentFederation) return

        setIsLoading(true)

        try {
            await fedimint.matrixSendMultispendGroupInvitation({
                roomId: roomId,
                signers: voters,
                threshold: thresholdNumber,
                federationId: paymentFederation.id,
                federationName: paymentFederation.name,
            })
        } catch (e) {
            // TODO: Handle error properly
            log.error('handleSubmit', e)
            toast.error(t, e)
        } finally {
            navigation.dispatch(
                reset('ChatRoomConversation', {
                    roomId,
                    chatType: ChatType.group,
                }),
            )
        }
    }, [
        canSubmit,
        voters,
        approvalThreshold,
        paymentFederation,
        roomId,
        navigation,
        t,
        toast,
    ])

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop">
            <KeyboardAwareWrapper behavior="position">
                <View style={style.content}>
                    <View style={style.header}>
                        <HoloCircle
                            size={100}
                            content={<SvgImage name="Wallet" size={32} />}
                        />
                    </View>
                    <View style={style.field}>
                        <View style={style.fieldInfo}>
                            <Text caption medium>
                                {t('phrases.wallet-federation')}
                            </Text>
                            <Text small style={style.fieldDescription}>
                                {t(
                                    'feature.multispend.wallet-federation-description',
                                )}
                            </Text>
                        </View>
                        {federations.length === 0 ? (
                            <Button
                                onPress={() =>
                                    navigation.navigate('JoinFederation', {})
                                }>
                                {t('feature.federations.join-federation')}
                            </Button>
                        ) : (
                            <View style={style.federationContainer}>
                                <FederationWalletSelector
                                    fullWidth
                                    showBalance={false}
                                />
                                {federationError && (
                                    <Text small style={style.error}>
                                        {federationError}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                    <Pressable
                        style={style.assignVoters}
                        onPress={handleAssignVoters}>
                        <View style={[style.fieldInfo, style.assignVotersInfo]}>
                            <View style={style.votersTitle}>
                                <Text caption medium>
                                    {t('feature.multispend.assign-voters')}
                                </Text>
                                {areVotersSufficient(voters) && (
                                    <View style={style.votersBadge}>
                                        <Text small>
                                            {t(
                                                'feature.multispend.n-voters-selected',
                                                { count: voters.length },
                                            )}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text small style={style.fieldDescription}>
                                {t(
                                    'feature.multispend.assign-voters-description',
                                )}
                            </Text>
                        </View>
                        <SvgImage name="ChevronRight" size={20} />
                    </Pressable>
                    {areVotersSufficient(voters) && (
                        <View style={style.field}>
                            <View style={style.fieldInfo}>
                                <Text caption medium>
                                    {t('feature.multispend.approval-threshold')}
                                </Text>
                                <Text small style={style.fieldDescription}>
                                    {t(
                                        'feature.multispend.approval-threshold-description',
                                    )}
                                </Text>
                            </View>
                            <Input
                                keyboardType="number-pad"
                                placeholder={t(
                                    'feature.multispend.choose-from-1-6',
                                )}
                                value={approvalThreshold}
                                onChangeText={text =>
                                    setApprovalThreshold(
                                        text.replace(/[^0-9]/g, ''),
                                    )
                                }
                                maxLength={1}
                                inputContainerStyle={style.searchInputStyle}
                                containerStyle={style.searchInputContainerStyle}
                                errorMessage={approvalThresholdError}
                            />
                        </View>
                    )}
                </View>
            </KeyboardAwareWrapper>
            <Flex gap="md">
                {!areVotersSufficient(voters) && (
                    <Text caption color={theme.colors.grey} center>
                        {t('feature.multispend.two-voters-required')}
                    </Text>
                )}
                <Button
                    onPress={handleSubmit}
                    disabled={!canSubmit || isLoading}>
                    {t('words.submit')}
                </Button>
            </Flex>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            flex: 1,
            gap: theme.spacing.xl,
        },
        header: {
            gap: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            alignItems: 'center',
        },
        field: {
            gap: theme.spacing.md,
        },
        fieldInfo: {
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
        },
        assignVotersInfo: {
            flexGrow: 1,
            flexShrink: 1,
        },
        fieldDescription: {
            color: theme.colors.darkGrey,
        },
        assignVoters: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        votersTitle: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        votersBadge: {
            backgroundColor: theme.colors.offWhite,
            borderRadius: 4,
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.xxs,
        },
        searchInputStyle: {
            borderBottomWidth: 0,
            height: '100%',
        },
        searchInputContainerStyle: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1.5,
            borderRadius: 8,
            height: 48,
        },
        error: { color: theme.colors.red, paddingLeft: theme.spacing.sm },
        federationContainer: {
            flexDirection: 'column',
            gap: theme.spacing.xs,
        },
    })

export default CreateMultispend
