# Meta Fields

Federations can supply additional config and metadata to clients.

The following meta fields are interpretable by the Fedi app (note the `fedi:` prefix on all fields) to provide additional functionality that affects the user experience:

* [`fedi:chat_server_domain`](chat_server_domain.md): The domain of a self-hosted Prosody XMPP server that enable in-app chat functionality
* [`fedi:default_currency`](default_currency.md): 3-letter ISO 4217 currency code
* [`fedi:tos_url`](tos_url.md): A URL presented to the user before joining the federation
* [`fedi:federation_icon_url`](federation_icon_url.md): A URL to a JPG or PNG file used as the federation icon
* [`fedi:fedi_internal_injection_disabled`](fedi_internal_injection_disabled.md): Boolean value that disables the `fediInternal` injection
* [`fedi:popup_end_timestamp`](popup_end_timestamp.md): A Unix timestamp after which the app will disable access to the federation
* [`fedi:popup_countdown_message`](popup_countdown_message.md): A message presented to users before the `popup_end_timestamp` is reached
* [`fedi:popup_ended_message`](popup_ended_message.md): A message presented to users after the `popup_end_timestamp` has passed
* [`fedi:invite_codes_disabled`](invite_codes_disabled.md): Boolean value that blocks access to the federation invite code
* [`fedi:new_members_disabled`](new_members_disabled.md): Boolean value that prevents new members from joining the federation
* [`fedi:social_recovery_disabled`](social_recovery_disabled.md): Boolean value that disables the social backup & recovery features
* [`fedi:offline_wallet_disabled`](offline_wallet_disabled.md): Boolean value that disables offline ecash generation features
* [`fedi:onchain_deposits_disabled`](onchain_deposits_disabled.md): Boolean value that disables the onchain deposit features
* [`fedi:stability_pool_disabled`](stability_pool_disabled.md): Boolean value that disables the stability pool features
* [`fedi:max_invoice_msats`](max_invoice_msats.md): Number value in millisats that prevents users from generating invoices higher than the specified amount
* [`fedi:max_balance_msats`](max_balance_msats.md): Number value in millisats that prevents users from having a balance higher than the specified amount
* [`fedi:fedimods`](fedimods.md): Stringified JSON array of objects representing the default FediMods shown to users upon joining the federation
* [`fedi:default_group_chats`](default_group_chats.md): Stringified JSON array of strings representing the IDs of any chat groups that all users will join automatically upon creating their username
* [`fedi:welcome_message`](welcome_message.md): A message presented to users upon joining the federation
* [`fedi:pinned_message`](pinned_message.md): A message presented to users on the main Communtity home screen
