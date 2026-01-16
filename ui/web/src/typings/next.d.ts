import 'next'

declare module 'next' {
    interface NextPage {
        noProviders?: boolean
    }
}
