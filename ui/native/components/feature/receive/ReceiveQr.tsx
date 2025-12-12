import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Share, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectLoadedFederation } from '@fedi/common/redux'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useAppSelector } from '../../../state/hooks'
import { BitcoinOrLightning, BtcLnUri, Federation } from '../../../types'
import Flex from '../../ui/Flex'
import NotesInput from '../../ui/NotesInput'
import QRCode from '../../ui/QRCode'
import { FederationLogo } from '../federations/FederationLogo'
import OnchainDepositInfo from './OnchainDepositInfo'

const log = makeLog('ReceiveQr')

export type ReceiveQrProps = {
    uri: BtcLnUri | { fullString: string; body: string }
    type?: BitcoinOrLightning
    title?: React.ReactNode
    federationId?: Federation['id']
    onSaveNotes?: (notes: string) => void
}

const QR_CODE_SIZE = Dimensions.get('window').width * 0.7

const ReceiveQr: React.FC<ReceiveQrProps> = ({
    uri,
    type,
    title,
    federationId = '',
    onSaveNotes,
}: ReceiveQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const [notes, setNotes] = useState('')
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    const copyToClipboard = () => {
        if (!uri.body) return

        Clipboard.setString(uri.body)
        toast.show({
            content: t('feature.receive.copied-payment-code'),
            status: 'success',
        })
    }

    const openShareDialog = async () => {
        // open share dialog
        try {
            if (!uri.fullString)
                throw new Error(
                    'Share Dialog could not be opened since uri.fullString is undefined',
                )

            const result = await Share.share({
                message: uri.fullString,
            })
            log.info('openShareDialog result', result)
        } catch (error) {
            log.error('openShareDialog', error)
        }
    }

    const style = styles(theme)

    return (
        <Flex grow justify="between" gap="xl">
            <Flex grow center gap="lg" style={style.content}>
                {title ? <>{title}</> : null}
                <Card containerStyle={style.qrCard}>
                    {uri.fullString && (
                        <Flex center>
                            <QRCode
                                value={uri.fullString}
                                size={QR_CODE_SIZE}
                            />
                        </Flex>
                    )}

                    <Flex align="center" style={style.uriContainer}>
                        <Text style={style.uri} numberOfLines={1} small>
                            {stringUtils.truncateMiddleOfString(uri.body, 6)}
                        </Text>
                    </Flex>
                </Card>
                {type === BitcoinOrLightning.bitcoin && (
                    <NotesInput
                        notes={notes}
                        setNotes={setNotes}
                        onSave={() => onSaveNotes?.(notes)}
                    />
                )}
                {type === BitcoinOrLightning.bitcoin && federationId && (
                    <OnchainDepositInfo federationId={federationId} />
                )}
            </Flex>
            <View>
                {type === BitcoinOrLightning.lnurl && federation && (
                    <View style={style.detailItem}>
                        <Text caption bold color={theme.colors.night}>{`${t(
                            'feature.receive.receive-to',
                        )}`}</Text>
                        <Flex row align="center" gap="xs">
                            <FederationLogo federation={federation} size={24} />

                            <Text
                                caption
                                medium
                                numberOfLines={1}
                                color={theme.colors.night}>
                                {federation?.name || ''}
                            </Text>
                        </Flex>
                    </View>
                )}
                <Flex row justify="between" fullWidth>
                    <Button
                        title={t('words.share')}
                        onPress={openShareDialog}
                        containerStyle={style.button}
                    />
                    <Button
                        title={t('words.copy')}
                        onPress={copyToClipboard}
                        containerStyle={style.button}
                    />
                </Flex>
            </View>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            paddingHorizontal: theme.spacing.lg,
        },
        button: {
            width: '48%',
        },
        uri: {
            lineHeight: 18,
        },
        uriContainer: {
            paddingTop: theme.spacing.md,
        },
        qrCard: {
            display: 'flex',
            borderRadius: 15,
            width: '100%',
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xs,
        },
        detailItem: {
            marginBottom: theme.spacing.xl,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
        },
    })

export default ReceiveQr
