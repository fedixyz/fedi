import '@testing-library/jest-dom'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
})

jest.mock('next/router', () => ({
    useRouter() {
        return {
            pathname: '',
            push: jest.fn(),
        }
    },
}))

global.URL.createObjectURL = jest.fn().mockImplementation(() => '/test-url')
global.URL.revokeObjectURL = jest.fn()

global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
}))
