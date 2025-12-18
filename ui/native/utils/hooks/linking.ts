import { useEffect } from 'react'
import { Platform } from 'react-native'
import { PlayInstallReferrer } from 'react-native-play-install-referrer'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('NativeLinkingHook')

function getDeferredReferrer(): Promise<string | null> {
    return new Promise(resolve => {
        if (Platform.OS !== 'android') return resolve(null)

        PlayInstallReferrer.getInstallReferrerInfo((info, error) => {
            log.info('getInstallReferrerInfo', info, error)
            if (!error && info?.installReferrer) {
                resolve(decodeURIComponent(info.installReferrer))
            } else {
                resolve(null)
            }
        })
    })
}

export function useHandleDeferredLink() {
    const [hasRequestedReferrer, completeRequestedReferrer] = useNuxStep(
        'hasRequestedReferrer',
    )

    useEffect(() => {
        async function checkInitialLink() {
            log.info('Has requested referrer', { hasRequestedReferrer })
            if (!hasRequestedReferrer) {
                // Ensures that request is only made once
                completeRequestedReferrer()

                log.info('Requesting referrer')
                const deferredReferrer = await getDeferredReferrer()

                if (deferredReferrer) {
                    log.info('Deferred url', deferredReferrer)
                    return
                }
            } else {
                log.info('Already requested referrer')
                return
            }
        }

        checkInitialLink()
    }, [hasRequestedReferrer, completeRequestedReferrer])
}
