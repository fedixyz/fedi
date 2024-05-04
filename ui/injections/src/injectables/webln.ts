import type { WebLNProvider, RequestInvoiceArgs, KeysendArgs } from 'webln'

import { InjectionMessageType, InjectionMessageResponseMap } from '../types'
import { sendInjectorMessage } from '../utils'

class InjectionWebLNProvider implements WebLNProvider {
    private isEnabled = false
    private lastMessageId = 0

    async enable() {
        if (this.isEnabled) {
            return
        }

        return this.sendMessage(
            InjectionMessageType.webln_enable,
            undefined,
        ).then(() => {
            this.isEnabled = true
        })
    }

    async getInfo() {
        this.ensureEnabled()
        return this.sendMessage(InjectionMessageType.webln_getInfo, undefined)
    }

    async sendPayment(paymentRequest: string) {
        this.ensureEnabled()
        return this.sendMessage(
            InjectionMessageType.webln_sendPayment,
            paymentRequest,
        )
    }

    async keysend(args: KeysendArgs) {
        this.ensureEnabled()
        return this.sendMessage(InjectionMessageType.webln_keysend, args)
    }

    async makeInvoice(args: string | number | RequestInvoiceArgs) {
        this.ensureEnabled()

        // Force args into RequestInvoiceArgs format
        if (typeof args !== 'object') {
            args = { amount: args }
        }

        return this.sendMessage(InjectionMessageType.webln_makeInvoice, args)
    }

    async signMessage(message: string) {
        this.ensureEnabled()
        return this.sendMessage(InjectionMessageType.webln_signMessage, message)
    }

    async verifyMessage(signature: string, message: string) {
        this.ensureEnabled()

        return this.sendMessage(InjectionMessageType.webln_verifyMessage, {
            signature,
            message,
        })
    }

    /** Throws if WebLN hasn't been enabled. */
    private ensureEnabled() {
        if (!this.isEnabled) {
            throw new Error('Provider must be enabled before use')
        }
    }

    /** Sends a message to the injector via postMessage, returns response */
    private async sendMessage<T extends InjectionMessageType>(
        type: T,
        data: InjectionMessageResponseMap[T]['message'],
    ): Promise<InjectionMessageResponseMap[T]['response']> {
        const id = this.lastMessageId++
        return sendInjectorMessage({ id, type, data })
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).webln = new InjectionWebLNProvider()

// Removed during compilation
export default ''
