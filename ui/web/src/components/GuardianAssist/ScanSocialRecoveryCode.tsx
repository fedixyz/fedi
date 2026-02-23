import React from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectAuthenticatedGuardian,
    socialRecoveryDownloadVerificationDoc,
} from '@fedi/common/redux'
import { ParserDataType } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { Column } from '../../components/Flex'
import * as Layout from '../../components/Layout'
import { OmniInput } from '../../components/OmniInput'
import { Text } from '../../components/Text'
import { settingsCompleteRecoveryAssistRoute } from '../../constants/routes'
import { useRouteStateContext } from '../../context/RouteStateContext'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

const log = makeLog('ScanSocialRecoveryCode')

export function ScanSocialRecoveryCode() {
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { pushWithState } = useRouteStateContext()

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const handleUserInput = async (data: { recoveryId: string }) => {
        if (!authenticatedGuardian?.federationId) return

        try {
            const videoPath = await dispatch(
                socialRecoveryDownloadVerificationDoc({
                    fedimint,
                    recoveryId: data.recoveryId,
                    peerId: authenticatedGuardian.peerId,
                    federationId: authenticatedGuardian.federationId,
                }),
            ).unwrap()

            if (videoPath == null) {
                toast.show(t('feature.recovery.nothing-to-download'))
                return
            }

            pushWithState(settingsCompleteRecoveryAssistRoute, {
                recoveryId: data.recoveryId,
                videoPath: videoPath,
            })
        } catch (e) {
            log.error("Couldn't download video", e)
            toast.show({
                content: t('feature.recovery.download-failed'),
                status: 'error',
            })
        }
    }

    return (
        <Layout.Root>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.recovery.recovery-assist')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <Column align="center" gap="md">
                        <Text
                            variant="h2"
                            weight="medium"
                            center
                            css={{ lineHeight: 1.1 }}>
                            {t('feature.recovery.recovery-assist-scan-title')}
                        </Text>
                        <Text
                            variant="caption"
                            center
                            css={{ color: theme.colors.darkGrey }}>
                            {t(
                                'feature.recovery.recovery-assist-scan-subtitle',
                            )}
                        </Text>

                        <OmniInput
                            expectedInputTypes={[
                                ParserDataType.FedimintRecovery,
                            ]}
                            onExpectedInput={input =>
                                handleUserInput(input.data)
                            }
                            onUnexpectedSuccess={() => null}
                            customActions={['paste']}
                        />
                    </Column>
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled(Column, {})
