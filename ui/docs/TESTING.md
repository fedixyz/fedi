# UI Testing Guide

This guide covers testing workflows for the Fedi UI codebase, including unit tests, integration tests, and end-to-end tests.

## Quick Start

1. Start the development environment:
   ```bash
   just run-dev-ui
   ```

2. In the **dev** pane, press 't' to open testing utilities:
   ```
   UI Testing Utils: Select an option:
   a - run tests for all UI workspaces
   c - run tests for common workspace only  
   n - run tests for native workspace only
   w - run tests for web workspace only
   e - run e2e tests
   b - back
   ```

## UI Workspace Tests

The UI is organized into workspaces with different types of tests:

### Workspace Structure

- **`common/`** - Shared business logic, hooks, Redux state, and utilities
- **`native/`** - React Native components and native mobile-specific logic  
- **`web/`** - React web components and web-specific logic

### Test Types

- Unit Tests: For testing individual functions and components using mocks to minimize integration paths & cover more comprehensive edge cases / failure modes
- Integration Tests: Interactions between multiple components or systems, often using the Remote Bridge

### Remote Bridge Integration

Many UI tests require a **Remote Bridge** connection to test real fedimint interactions. The test runner automatically handles this:

### Automatic Remote Bridge Management

The `run-ui-tests.sh` script detects if a remote bridge is already running:

- **Bridge Running** (port 26722): Tests run against existing remote ridge
- **No Bridge**: Starts a temporary remote bridge with dev federation, runs tests, then shuts down

### Integration Test Builder

For complex integration tests, use the `IntegrationTestBuilder` pattern:

```typescript
import { createIntegrationTestBuilder } from '@fedi/common/utils/test-utils/remote-bridge-setup'

describe('onboarding flow', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should complete full onboarding', async () => {
        await builder
            .withOnboardingCompleted()
            .withFederationJoined()
            .withEcashReceived(100000)
            
        const { store } = context
        // Test final state...
    })
})
```

#### Available Builder Methods

- `withOnboardingCompleted()` - Completes user onboarding with new seed
- `withChatReady()` - Sets up Matrix authentication for chat
- `withFederationJoined()` - Joins a test federation  
- `withEcashReceived(amount)` - Receives ecash to test wallet functionality

### Manual Bridge Control

To run tests against your own bridge setup:

1. Start bridge manually:
   ```bash
   cd scripts/bridge && ./run-remote.sh --with-devfed
   ```

2. Run tests (will detect running bridge):
   ```bash
   # From dev-ui-utils testing menu
   a - run tests for all UI workspaces
   ```

## Test Commands

### Via Testing Menu
Access through development environment:
```bash
just run-dev-ui  # Then press 't' in dev pane
```

### Direct Commands

```bash
# All workspaces
env -C ui yarn test

# Specific workspace  
env -C ui/common yarn test
env -C ui/native yarn test
env -C ui/web yarn test

# With bridge auto-management
scripts/ui/run-ui-tests.sh
```

## Test Configuration

Tests use Jest with custom test environments and utilities:

### Common Test Utilities

- `renderHookWithState()` - Render React hooks with Redux state
- `createMockFedimintBridge()` - Mock fedimint interactions
- `mockInitializeCommonStore()` - Set up Redux store for testing
- Mock factories for transactions, Matrix events, federations

### Test Environment

Custom Jest environment combining Node.js and jsdom for testing both business logic and React components.

## End-to-End Tests

For mobile app testing with real devices/simulators, see the dedicated E2E documentation:

**[📱 E2E Testing Guide](../native/tests/README.md)**

## Best Practices

### Test Organization

- **Unit tests**: Test individual functions/components in isolation
- **Integration tests**: Test interactions between multiple parts
- **E2E tests**: Test complete UIUX flows on fully simulated devices

### Remote Bridge Tests

- Use `IntegrationTestBuilder` for complex multi-step scenarios
- Tests automatically handle bridge setup/teardown, each `it` statement gets its initialized bridge + device ID
- For pure unit tests with many `it` statements, consider using `createMockFedimintBridge` if a full remote bridge is not required, but an integration tes may be more suitable depending on what you are testing

### Test Data

- Use factory functions (`createMockTransaction`, `createMockPaymentEvent`, etc.)
- Avoid hardcoded test data
- Use realistic data structures matching production types

### Performance

- Integration tests have longer timeouts (10-60 seconds)
- Use `waitFor()` for async state changes
- Clean up resources in `afterEach` hooks

## Troubleshooting

### Remote Bridge Issues

```bash
# Check if remote bridge is running
lsof -i:26722

# Kill stuck bridge process
pkill -f "remote-bridge"

# Reset and restart
scripts/ui/run-ui-tests.sh
```

### Test Failures

- Check that dev federation is running properly
- Ensure no conflicting processes on required ports
- Review test timeouts for slow operations
