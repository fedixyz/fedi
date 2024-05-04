import 'i18next'

import { resources } from '../localization'

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNs: 'common'
        resources: (typeof resources)['en']
        returnNull: false
        returnObjects: false
    }
}
