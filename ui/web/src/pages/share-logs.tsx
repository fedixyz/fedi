import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import {
    selectPaymentFederation,
    selectLoadedFederations,
} from '@fedi/common/redux'
import { isValidSupportTicketNumber } from '@fedi/common/utils/validation'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import { Dialog } from '../components/Dialog'
import { FederationWalletSelector } from '../components/FederationWalletSelector'
import { Icon } from '../components/Icon'
import * as Layout from '../components/Layout'
import ShareLogs from '../components/ShareLogs'
import Success from '../components/Success'
import { Text } from '../components/Text'
import { useAppSelector } from '../hooks'
import { useShareLogs } from '../hooks/export'
import { styled, theme } from '../styles'

// Number of times the bug icon needs
// to be clicked to attach db logs
const BUG_CLICK_THRESHOLD = 21

export default function ShareLogsPage() {
    const { t } = useTranslation()
    const { status, collectAttachmentsAndSubmit } = useShareLogs()
    const { push } = useRouter()

    const walletFederations = useAppSelector(selectLoadedFederations)
    const paymentFederation = useAppSelector(selectPaymentFederation)

    const [ticketNumber, setTicketNumber] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isValid, setIsValid] = useState<boolean>(false)
    const [bugClicks, setBugClicks] = useState<number>(0)
    const [sendDb, setSendDb] = useState<boolean>(false)
    const [isSelectingFederation, setIsSelectingFederation] = useState(false)

    useEffect(() => {
        if (ticketNumber.trim().length === 0) {
            setIsValid(false)
            setError(null)
            return
        }

        const valid = isValidSupportTicketNumber(ticketNumber)

        setIsValid(valid)
        setError(valid ? null : t('feature.support.invalid-ticket-number'))
    }, [ticketNumber, t])

    useEffect(() => {
        if (status === 'error') {
            setError('Logs could not be submitted')
            return
        }
    }, [status])

    const handleOnSubmit = async () => {
        if (walletFederations.length > 0 && paymentFederation) {
            setIsSelectingFederation(true)
            return
        }
        if (!isValid) return

        await collectAttachmentsAndSubmit(sendDb, ticketNumber)
    }

    const handleOnBugClick = async () => {
        const newBugClicks = bugClicks + 1
        setBugClicks(newBugClicks)

        if (newBugClicks > BUG_CLICK_THRESHOLD) {
            setSendDb(true)
        }
    }

    if (status === 'success') {
        return (
            <Success
                title={t('feature.bug.success-title')}
                description={t('feature.bug.success-subtitle')}
                buttonText={t('words.done')}
                onClick={() => push('/settings')}
            />
        )
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header showCloseButton>
                    <Layout.Title subheader>
                        {t('feature.developer.share-logs')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content>
                    <ShareLogs
                        ticketNumber={ticketNumber}
                        onChange={setTicketNumber}
                        error={error}
                    />
                </Layout.Content>

                <Layout.Actions>
                    <Disclaimer
                        variant="caption"
                        css={{
                            color: theme.colors.darkGrey,
                        }}>
                        <BugIcon onClick={handleOnBugClick}>🪲</BugIcon>
                        <Trans
                            i18nKey="feature.support.log-disclaimer"
                            components={{
                                anchor: (
                                    <a
                                        target="_blank"
                                        href={'https://support.fedi.xyz'} // temporary until chat widget is used
                                    />
                                ),
                            }}
                        />
                    </Disclaimer>

                    {sendDb && (
                        <SendDbContainer>
                            <Text weight="medium">
                                {t('feature.bug.database-attached')} 🕷️🐞🦟
                            </Text>
                            <Icon icon={CheckIcon} />
                        </SendDbContainer>
                    )}

                    <Button
                        width="full"
                        loading={status === 'loading'}
                        onClick={() => handleOnSubmit()}>
                        {t('words.submit')}
                    </Button>
                </Layout.Actions>
            </Layout.Root>

            <Dialog
                mobileDismiss="overlay"
                open={isSelectingFederation}
                onOpenChange={setIsSelectingFederation}
                title={t('phrases.select-federation')}
                description={t(
                    'feature.developer.select-federation-share-logs',
                )}>
                <SelectFederationContent>
                    <FederationWalletSelector />
                    <Button width="full" onClick={() => handleOnSubmit()}>
                        {t('words.continue')}
                    </Button>
                </SelectFederationContent>
            </Dialog>
        </ContentBlock>
    )
}

const SendDbContainer = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
    background: theme.colors.offWhite,
    padding: 12,
    borderRadius: 12,
})

const SelectFederationContent = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const BugIcon = styled('div', {
    cursor: 'default',
    fontSize: 24,
    userSelect: 'none',
})

const Disclaimer = styled(Text, {
    '& a': {
        textDecoration: 'underline',
    },
})
