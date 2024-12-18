import { Platform } from 'react-native'
import Share from 'react-native-share'
import { fedimint } from '../../bridge'

import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import { LoadedFederation } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

const log = makeLog('Settings/export')

export const useNativeExport = () => {
    const exportTransactions = useExportTransactions(fedimint)
    const [exportingFederationId, setExportingFederationId] =
        useState<string>('')
    const toast = useToast()
    const { t } = useTranslation()

    const exportTransactionsAsCsv = useCallback(
        async (federation: LoadedFederation) => {
            setExportingFederationId(federation.id)

            const res = await exportTransactions(federation)

            if (res.success) {
                try {
                    await Share.open({
                        filename:
                            Platform.OS === 'android'
                                ? res.fileName.slice(0, -4)
                                : res.fileName,
                        type: 'text/csv',
                        url: res.uri,
                    })
                } catch {
                    /* no-op */
                }
            } else {
                log.error('error', res.message)
                toast.show({
                    content: t('errors.failed-to-fetch-transactions'),
                    status: 'error',
                })
            }

            setExportingFederationId('')
        },
        [exportTransactions, t, toast],
    )

    return { exportTransactionsAsCsv, exportingFederationId }
}
