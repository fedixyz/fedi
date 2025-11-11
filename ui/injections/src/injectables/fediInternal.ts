import {
    CreateCommunityRequest,
    EcashRequest,
    EditCommunityRequest,
    FediInternalVersion,
    InstallMiniAppRequest,
    MSats,
    SupportedCurrency,
} from '@fedi/common/types'
import { RpcCommunity } from '@fedi/common/types/bindings'

import { InjectionMessageResponseMap, InjectionMessageType } from '../types'
import { sendInjectorMessage } from '../utils'

class InjectionFediProvider {
    public version: FediInternalVersion = 1
    private lastMessageId = 0

    async generateEcash(
        ecashRequest: EcashRequest,
    ): Promise<{ notes: string }> {
        return this.sendMessage(
            InjectionMessageType.fedi_generateEcash,
            ecashRequest,
        )
    }

    async receiveEcash(ecash: string): Promise<{ msats: MSats }> {
        return this.sendMessage(InjectionMessageType.fedi_receiveEcash, ecash)
    }

    async getAuthenticatedMember(): Promise<{ id: string; username: string }> {
        return this.sendMessage(
            InjectionMessageType.fedi_getAuthenticatedMember,
            undefined,
        )
    }

    async getCurrencyCode(): Promise<SupportedCurrency> {
        return this.sendMessage(
            InjectionMessageType.fedi_getCurrencyCode,
            undefined,
        )
    }

    async getLanguageCode(): Promise<string> {
        return this.sendMessage(
            InjectionMessageType.fedi_getLanguageCode,
            undefined,
        )
    }

    async listCreatedCommunities(): Promise<{ communities: RpcCommunity[] }> {
        return this.sendMessage(
            InjectionMessageType.fedi_listCreatedCommunities,
            undefined,
        )
    }

    async createCommunity(
        community: CreateCommunityRequest,
    ): Promise<
        | { success: true; inviteCode: string }
        | { success: false; errors: Record<string, string[] | undefined> }
    > {
        return this.sendMessage(
            InjectionMessageType.fedi_createCommunity,
            community,
        )
    }

    async editCommunity(
        editCommunityRequest: EditCommunityRequest,
    ): Promise<
        | { success: true }
        | { success: false; errors: Record<string, string[] | undefined> }
    > {
        return this.sendMessage(
            InjectionMessageType.fedi_editCommunity,
            editCommunityRequest,
        )
    }

    async joinCommunity(
        inviteCode: string,
    ): Promise<
        | { success: true; community: RpcCommunity }
        | { success: false; errors: Record<string, string[] | undefined> }
    > {
        return this.sendMessage(
            InjectionMessageType.fedi_joinCommunity,
            inviteCode,
        )
    }

    async refreshCommunities(): Promise<void> {
        return this.sendMessage(
            InjectionMessageType.fedi_refreshCommunities,
            undefined,
        )
    }

    async setSelectedCommunity(
        communityId: string,
    ): Promise<
        | { success: true }
        | { success: false; errors: Record<string, string[] | undefined> }
    > {
        return this.sendMessage(
            InjectionMessageType.fedi_setSelectedCommunity,
            communityId,
        )
    }

    async selectPublicChats(): Promise<Array<string>> {
        return this.sendMessage(
            InjectionMessageType.fedi_selectPublicChats,
            undefined,
        )
    }

    async navigateHome(): Promise<void> {
        return this.sendMessage(
            InjectionMessageType.fedi_navigateHome,
            undefined,
        )
    }

    async getInstalledMiniApps(): Promise<{ url: string }[]> {
        return this.sendMessage(
            InjectionMessageType.fedi_getInstalledMiniApps,
            undefined,
        )
    }

    async installMiniApp(request: InstallMiniAppRequest): Promise<void> {
        return this.sendMessage(
            InjectionMessageType.fedi_installMiniApp,
            request,
        )
    }

    /** Sends a message to the injector via postMessage, returns response */
    private async sendMessage<K extends keyof InjectionMessageResponseMap>(
        type: K,
        message: InjectionMessageResponseMap[K]['message'],
    ): Promise<InjectionMessageResponseMap[K]['response']> {
        const id = this.lastMessageId++
        const response = await sendInjectorMessage({ id, type, data: message })
        return response as InjectionMessageResponseMap[K]['response']
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any)['fediInternal'] = new InjectionFediProvider()

// Removed during compilation
export default ''
