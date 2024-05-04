import React from 'react'

import { makeLog } from '../utils/log'

const log = makeLog('ErrorBoundary')

interface ErrorBoundaryState {
    didCatch: boolean
    error: unknown
}

const initialState: ErrorBoundaryState = {
    didCatch: false,
    error: null,
}

export interface ErrorFallbackProps {
    error: unknown
    resetErrorBoundary: () => void
}

interface ErrorBoundaryProps {
    children: React.ReactNode
    /**
     * Can either be a simple ReactNode, or a function that returns a ReactNode.
     * If a function is provided, it will be passed `ErrorFallbackProps`.
     */
    fallback: React.ReactNode | ((props: ErrorFallbackProps) => React.ReactNode)
    /** Optional callback when an error is encountered, no handling required */
    onError?: (error: Error, info: { componentStack: string }) => void
    /**
     * Optional callback that's triggered if the `fallback` component implements
     * and triggers `resetErrorBoundary`. This trigger could do something like
     * reset some component state, navigate a user elsewhere, or re-fetch data.
     */
    onReset?: () => void
}

/**
 * ErrorBoundary provides a simple wrapper around components we consider "unsafe"
 * to provide a fallback in case they throw an error.
 */
export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props)

        this.resetErrorBoundary = this.resetErrorBoundary.bind(this)
        this.state = initialState
    }

    // Must be a class component to implement `getDerivedStateFromError`.
    static getDerivedStateFromError(error: Error) {
        return { didCatch: true, error }
    }

    resetErrorBoundary() {
        const { error } = this.state

        if (error !== null) {
            this.setState(initialState)
        }
    }

    // Must be a class component to implement `componentDidCatch`.
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.props.onError?.(error, info)
        log.error(error.message, { error, info })
    }

    render() {
        const { children, fallback } = this.props
        const { didCatch, error } = this.state

        let childToRender = children

        if (didCatch) {
            if (typeof fallback === 'function') {
                const props: ErrorFallbackProps = {
                    error,
                    resetErrorBoundary: this.resetErrorBoundary,
                }
                childToRender = (
                    fallback as (props: ErrorFallbackProps) => React.ReactNode
                )(props)
            } else {
                childToRender = fallback
            }
        }

        return <>{childToRender}</>
    }
}
