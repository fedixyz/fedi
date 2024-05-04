import { client, xml } from '@xmpp/client'
import debug from '@xmpp/debug'
import XMPPError from '@xmpp/error'

import { XmppConnectionOptions } from '../types'
import { makeLog } from './log'

const log = makeLog('common/utils/xmpp')

type CustomError = XMPPError & { code: string }

/**
 * Creates an ephemeral XMPP client used solely for registration
 * opens the stream and terminates on success or failure.
 * @deprecated XMPP legacy code
 */
export const registerXmppUser = async (
    username: string,
    password: string,
    xmppOptions: XmppConnectionOptions,
): Promise<boolean> => {
    log.debug('register xmpp user', username)
    return new Promise((resolve, reject) => {
        // Connect to XMPP server without credentials to establish
        // a session for registration
        const xmppConnectionOptions = {
            service: xmppOptions.service,
            resource: xmppOptions.resource,
        }
        log.info(
            'registerXmppUser: xmppConnectionOptions',
            xmppConnectionOptions,
        )

        const xmpp = client(xmppConnectionOptions)
        debug(xmpp, true)

        // Listen for errors...
        xmpp.on('error', async (error: CustomError) => {
            log.error('error', error)
            // code=ECONNERROR means the network connection was not successful
            if (error.code === 'ECONNERROR') {
                await xmpp.stop()
                xmpp.removeAllListeners()
                // return the i18n string for connection error
                reject('errors.chat-connection-unhealthy')
            }
        })

        // Send the registration request when the stream is opened
        xmpp.on('open', () => {
            xmpp.send(
                xml(
                    'iq',
                    { type: 'set', to: xmppOptions.domain, id: 'register' },
                    xml(
                        'query',
                        { xmlns: 'jabber:iq:register' },
                        xml('username', {}, username),
                        xml('password', {}, password),
                    ),
                ),
            )
        })

        // Listen for successful registration
        xmpp.on('stanza', async stanza => {
            // Receive a registration response from the server
            if (stanza.is('iq') && stanza.getAttr('id') === 'register') {
                // Shutdown the XMPP client (to be reinstantiated later)
                await xmpp.stop()
                xmpp.removeAllListeners()

                // Resolve or reject the promise based on registration response
                if (stanza.getAttr('type') === 'result') {
                    resolve(true)
                } else if (stanza.getAttr('type') === 'error') {
                    const error = stanza.getChild('error')
                    // TODO: Figure out how to bubble up i18n strings better.
                    // We should probably create an ErrorWithTranslation class or
                    // something that sets has an i18n property.
                    let errorMessage = 'errors.unknown-error'
                    if (error?.getChild('conflict')) {
                        errorMessage = 'errors.username-already-exists'
                    }

                    reject(errorMessage)
                }
            }
        })

        xmpp.start().catch(err => log.error('xmpp.start', err))
    })
}

/**
 * Creates an ephemeral XMPP client used solely for authentication check
 * opens the stream and terminates on success or failure.
 * @deprecated XMPP legacy code
 */
export const checkXmppUser = async (
    username: string,
    password: string,
    xmppOptions: XmppConnectionOptions,
): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        // Connect to XMPP server with provided credentials to check
        // if the user exists
        const xmppConnectionOptions = {
            service: xmppOptions.service,
            resource: xmppOptions.resource,
            username,
            password,
        }
        log.info('checkXmppUser: xmppConnectionOptions', xmppConnectionOptions)

        const xmpp = client(xmppConnectionOptions)
        debug(xmpp, true)

        // Listen for errors...
        xmpp.on('error', async (error: CustomError) => {
            log.info('error', error)
            // condition=not-authorized error means user exists but the credentials are not valid
            if (error.condition === 'not-authorized') {
                await xmpp.stop()
                xmpp.removeAllListeners()
                resolve(false)
            }
            // code=ECONNERROR means the network connection was not successful
            if (error.code === 'ECONNERROR') {
                await xmpp.stop()
                xmpp.removeAllListeners()
                // return the i18n string for connection error
                reject('errors.chat-connection-unhealthy')
            }
        })

        // Listen for successful online event meaning the credentials are valid
        xmpp.on('online', async () => {
            // Shutdown the XMPP client (to be reinstantiated later)
            // TODO: Refactor this to not require ephemeral clients
            await xmpp.stop()
            xmpp.removeAllListeners()
            resolve(true)
        })

        xmpp.start().catch(err => log.error('xmpp.start', err))
    })
}

// TODO: Harden this encoding scheme (use standard URL params?)
/** @deprecated XMPP legacy code */
export function encodeGroupInvitationLink(groupId: string) {
    return `fedi:group:${groupId}:::`
}

/** @deprecated XMPP legacy code */
export function decodeGroupInvitationLink(link: string): string {
    const afterPrefix = link.split('fedi:group:')[1]
    if (!afterPrefix) throw new Error('feature.chat.invalid-group')
    let groupId = afterPrefix.slice(0, -3)

    // handle old group invite codes for backwards compatibility
    // new group codes have 3 trailing colons `:::` after the group ID
    const encodingSuffix = afterPrefix.slice(-3)
    if (encodingSuffix !== ':::') {
        groupId = afterPrefix
    }

    if (!groupId) throw new Error('feature.chat.invalid-group')

    return groupId
}

/** @deprecated XMPP legacy code */
export function encodeDirectChatLink(memberId: string): string {
    return `fedi:member:${memberId}:::`
}

/** @deprecated XMPP legacy code */
export function decodeDirectChatLink(link: string): string {
    const afterPrefix = link.split('fedi:member:')[1]
    if (!afterPrefix) throw new Error('feature.chat.invalid-member')

    const memberId = afterPrefix.slice(0, -3)

    if (!memberId) throw new Error('feature.chat.invalid-member')

    return memberId
}
