import React from 'react'

import { styled } from '../../styles'
import * as Layout from '../Layout'

export const OnboardingContainer = styled(Layout.Root, {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
})

export const OnboardingContent: React.FC<
    React.ComponentProps<typeof OnboardingContentInner> &
        React.ComponentProps<typeof OnboardingContentScroll>
> = props => {
    return (
        <Layout.Content>
            <OnboardingContentScroll>
                <OnboardingContentInner {...props} />
            </OnboardingContentScroll>
        </Layout.Content>
    )
}

const OnboardingContentScroll = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
})

const OnboardingContentInner = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 340,
    paddingTop: 16,

    variants: {
        justify: {
            center: {
                justifyContent: 'center',
            },
            start: {
                justifyContent: 'flex-start',
            },
        },
        gap: {
            sm: {
                gap: 8,
            },
            md: {
                gap: 16,
            },
        },
        fullWidth: {
            true: {
                width: '100%',
                maxWidth: 'none',
            },
        },
    },
    defaultVariants: {
        justify: 'center',
        gap: 'sm',
    },
})

export const OnboardingActions = styled(Layout.Actions, {
    maxWidth: 340,
    gap: 16,
})
