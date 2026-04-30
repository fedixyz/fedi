import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'

import { NoteInput } from '.'
import { styled } from '../../styles'
import { Button } from '../Button'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import { QRCode } from '../QRCode'
import { Text } from '../Text'

export default function OnchainRequest({
    address,
    onSaveNotes,
}: {
    address: string | null
    onSaveNotes: (notes: string) => void
}) {
    const { t } = useTranslation()
    const [notes, setNotes] = useState('')
    const [canShare, setCanShare] = useState(false)

    const toast = useToast()

    const handleShare = () => {
        if (!address || !('share' in navigator)) return

        navigator.share({
            text: address,
        })
    }

    const handleCopy = () => {
        if (!address) return

        navigator.clipboard.writeText(address).then(() =>
            toast.show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            }),
        )
    }

    useEffect(() => {
        setCanShare(
            Boolean('canShare' in navigator && navigator.canShare() && address),
        )
    }, [address])

    return (
        <OnchainRequestContainer>
            <Column grow gap="lg">
                <QRCode data={address} />
                <NoteInput
                    value={notes}
                    placeholder={t('phrases.add-note')}
                    onChange={e => setNotes(e.currentTarget.value)}
                    onBlur={() => onSaveNotes(notes)}
                />
                <OnchainInfo>
                    <OnchainInfoContent>
                        <Row align="center" gap="md">
                            <Icon icon="Network" />
                            <Column>
                                <Text weight="bold">
                                    {t(
                                        'feature.receive.receive-guidance-title-1',
                                    )}
                                </Text>
                                <Text>
                                    {t(
                                        'feature.receive.receive-guidance-subtitle-1',
                                    )}
                                </Text>
                            </Column>
                        </Row>
                        <Row align="center" gap="md">
                            <Icon icon="BitcoinCircle2" />
                            <Column>
                                <Text weight="bold">
                                    {t(
                                        'feature.receive.receive-guidance-title-2',
                                    )}
                                </Text>
                                <Text>
                                    {t(
                                        'feature.receive.receive-guidance-subtitle-2',
                                    )}
                                </Text>
                            </Column>
                        </Row>
                    </OnchainInfoContent>
                </OnchainInfo>
            </Column>
            <Row gap="md" align="center">
                {canShare && (
                    <Button width="full" onClick={handleShare}>
                        {t('words.share')}
                    </Button>
                )}
                <Button width="full" onClick={handleCopy}>
                    {t('words.copy')}
                </Button>
            </Row>
        </OnchainRequestContainer>
    )
}

const OnchainRequestContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflowY: 'auto',
    gap: theme.spacing.lg,
})

const OnchainInfo = styled('div', {
    fediGradient: 'sky-heavy',
    padding: 2,
    borderRadius: 16,
})

const OnchainInfoContent = styled('div', {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
})
