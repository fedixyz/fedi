import type {
    EnvironmentContext,
    JestEnvironmentConfig,
} from '@jest/environment'
import { TestEnvironment as JSDOMEnvironment } from 'jest-environment-jsdom'
import { TestEnvironment } from 'jest-environment-node'

class PrivateJSDOMEnvironment extends JSDOMEnvironment {
    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
        super(config, context)
    }
}

export default class extends TestEnvironment {
    private jsdomEnvironment: PrivateJSDOMEnvironment

    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
        super(config, context)

        // Create a jsdom environment to borrow its DOM globals
        this.jsdomEnvironment = new PrivateJSDOMEnvironment(config, context)

        // Add the globals we need for tests to work
        this.setupGlobals()
    }

    private setupGlobals() {
        // need these DOM globals for renderHook to work
        this.global.document = this.jsdomEnvironment.global.document
        this.global.window = this.jsdomEnvironment.global.window
        this.global.window.document = this.global.document

        // Assigns Jest's custom global error types to those of node
        // Necessary for `instanceof Error` checks to work properly
        this.global.Error = Error
        this.global.TypeError = TypeError
        this.global.SyntaxError = SyntaxError
        this.global.URIError = URIError
        this.global.RangeError = RangeError
    }
}
