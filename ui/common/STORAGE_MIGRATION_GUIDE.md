# Storage Migration Guide

_(this doc is AI-generated)_

This guide explains how to add a storage migration when making changes to the persisted Redux state in the Fedi application.

## Overview

The storage system persists Redux state to device storage and handles migrations to ensure users' data is properly transformed when the app is updated. The system consists of three main files:

-   **`ui/common/types/storage.ts`**: Defines all storage state versions as TypeScript interfaces
-   **`ui/common/utils/storage.ts`**: Contains migration logic and storage utilities
-   **`ui/common/redux/storage.ts`**: Redux slice for loading/saving storage

## When Do You Need a Migration?

You need a migration when:

1. **Adding a new field** to persisted state
2. **Removing a field** from persisted state
3. **Renaming a field** in persisted state
4. **Changing the structure** of persisted data (e.g., from array to object)
5. **Transforming data** to a new format

## Step-by-Step Guide

### Step 1: Update the Redux State

First, make your changes to the Redux state in the relevant slice (e.g., `environment`, `federation`, `currency`, etc.).

```typescript
// Example: Adding a new field to environment state
export const environmentSlice = createSlice({
    name: 'environment',
    initialState: {
        // ... existing fields
        newFeatureEnabled: false, // NEW FIELD
    },
    // ...
})
```

### Step 2: Define the New Storage Version

In `ui/common/types/storage.ts`:

1. **Create a new interface** for the next version number
2. **Extend from the previous version** using `Omit` if you're removing/changing fields
3. **Add/modify the fields** you need

```typescript
// Find the current LatestStoredState (e.g., StoredStateV40)
// Then create the next version:

export interface StoredStateV41 extends Omit<StoredStateV40, 'version'> {
    version: 41
    newFeatureEnabled: boolean // NEW FIELD
}

// If you're removing a field, use Omit:
export interface StoredStateV41
    extends Omit<StoredStateV40, 'version' | 'oldFieldName'> {
    version: 41
    newFeatureEnabled: boolean
}
```

### Step 3: Update Type Unions

In `ui/common/types/storage.ts`, add your new version to the `AnyStoredState` union:

```typescript
export type AnyStoredState =
    | OldStoredState
    | StoredStateV25
    // ... other versions ...
    | StoredStateV40
    | StoredStateV41 // ADD YOUR NEW VERSION
```

### Step 4: Update the Latest Type Alias

Update the `LatestStoredState` type alias to point to your new version:

```typescript
/*** Alias for the latest version of stored state ***/
export type LatestStoredState = StoredStateV41 // UPDATE THIS
```

### Step 5: Add Migration Logic

In `ui/common/utils/storage.ts`, add your migration in the `migrateStoredState` function:

```typescript
async function migrateStoredState(
    state: AnyStoredState,
    storage: StorageApi,
): Promise<LatestStoredState> {
    let migrationState = { ...state }

    // ... existing migrations ...

    // Version 40 -> 41
    if (migrationState.version === 40) {
        migrationState = {
            ...migrationState,
            version: 41,
            newFeatureEnabled: false, // Provide default value
        }
    }

    return migrationState
}
```

**Migration Pattern Examples:**

**Adding a field:**

```typescript
if (migrationState.version === 40) {
    migrationState = {
        ...migrationState,
        version: 41,
        newField: defaultValue,
    }
}
```

**Removing a field:**

```typescript
if (migrationState.version === 40) {
    const { fieldToRemove, ...rest } = migrationState
    migrationState = {
        ...rest,
        version: 41,
    }
}
```

**Renaming a field:**

```typescript
if (migrationState.version === 40) {
    const { oldName, ...rest } = migrationState
    migrationState = {
        ...rest,
        version: 41,
        newName: oldName, // Preserve the value
    }
}
```

**Transforming data:**

```typescript
if (migrationState.version === 40) {
    migrationState = {
        ...migrationState,
        version: 41,
        newStructure: transformData(migrationState.oldStructure),
    }
}
```

### Step 6: Update transformStateToStorage

In `ui/common/utils/storage.ts`, update the `transformStateToStorage` function to include your new field:

```typescript
export function transformStateToStorage(state: CommonState): LatestStoredState {
    const transformedState: LatestStoredState = {
        version: 41, // UPDATE VERSION NUMBER
        // ... existing fields ...
        newFeatureEnabled: state.environment.newFeatureEnabled, // ADD NEW FIELD
    }

    return transformedState
}
```

**Important:** This function maps from Redux state to storage state. Make sure the path matches where the data lives in Redux.

### Step 7: Update hasStorageStateChanged

In `ui/common/utils/storage.ts`, add your new field to the `hasStorageStateChanged` function:

```typescript
export function hasStorageStateChanged(
    oldState: CommonState,
    newState: CommonState,
) {
    const keysetsToCheck = [
        // ... existing keys ...
        ['environment', 'newFeatureEnabled'], // ADD YOUR NEW FIELD
    ]

    for (const keysToCheck of keysetsToCheck) {
        if (get(oldState, keysToCheck) !== get(newState, keysToCheck)) {
            return true
        }
    }
    return false
}
```

**Important:** This function is a performance optimization. It prevents unnecessary storage writes by checking only specific fields by reference. Keep this in sync with `transformStateToStorage`.

### Step 8: Handle Redux State Hydration (Optional)

If you need special handling when loading stored state, update the Redux slice's `extraReducers`:

```typescript
// In your Redux slice (e.g., environment slice)
extraReducers: builder => {
    builder.addCase(loadFromStorage.fulfilled, (state, action) => {
        if (action.payload) {
            state.newFeatureEnabled = action.payload.newFeatureEnabled ?? false
        }
    })
}
```

### Step 9: Test Your Migration

1. **Test fresh install:** Clear app storage and verify defaults work
2. **Test migration:** Use old storage version and verify migration runs
3. **Test edge cases:** Test with missing/null values
4. **Test data preservation:** Ensure existing user data isn't lost

**Testing Tips:**

```typescript
// You can test migrations by creating test data:
const oldState: StoredStateV40 = {
    version: 40,
    // ... populate with test data
}

const migratedState = await migrateStoredState(oldState, storage)
console.log(migratedState.version) // Should be 41
console.log(migratedState.newFeatureEnabled) // Should have default value
```

## Common Patterns

### Pattern 1: Adding Optional Field

```typescript
// types/storage.ts
export interface StoredStateV41 extends Omit<StoredStateV40, 'version'> {
    version: 41
    optionalField?: string
}

// utils/storage.ts migration
if (migrationState.version === 40) {
    migrationState = {
        ...migrationState,
        version: 41,
        optionalField: undefined, // or omit if truly optional
    }
}
```

### Pattern 2: Migrating Nested Data

```typescript
// utils/storage.ts migration
if (migrationState.version === 40) {
    const transformedData = Object.entries(migrationState.oldData).reduce(
        (acc, [key, value]) => {
            acc[key] = transformValue(value)
            return acc
        },
        {} as NewDataType,
    )

    migrationState = {
        ...migrationState,
        version: 41,
        newData: transformedData,
    }
}
```

### Pattern 3: Conditional Migration

```typescript
// utils/storage.ts migration
if (migrationState.version === 40) {
    const newValue = migrationState.oldField
        ? transformField(migrationState.oldField)
        : defaultValue

    migrationState = {
        ...migrationState,
        version: 41,
        newField: newValue,
    }
}
```

### Pattern 4: Migration with Storage Access

```typescript
// utils/storage.ts migration
if (migrationState.version === 40) {
    // Can read from storage if needed for migration
    const legacyValue = await storage.getItem('legacyKey')

    migrationState = {
        ...migrationState,
        version: 41,
        migratedField: legacyValue || defaultValue,
    }

    // Clean up old storage keys if needed (do this carefully!)
    // await storage.removeItem('legacyKey')
}
```

## Important Notes

### Version Numbering

-   Versions are sequential integers (0, 1, 2, ..., 40, 41, ...)
-   Never skip version numbers
-   Never reuse version numbers
-   The version number in storage is the source of truth

### Backwards Compatibility

-   Migrations must work from ANY old version to the latest
-   Users might skip multiple app versions
-   All intermediate migrations will run sequentially

### Performance Considerations

-   `hasStorageStateChanged` is called on EVERY Redux state change
-   Use reference checks (`===`) instead of deep equality
-   Only check fields that are actually persisted

### Data Safety

-   Provide sensible defaults for new fields
-   Never lose user data during migration
-   Test migrations thoroughly before release
-   Consider logging migration successes/failures

### Type Safety

-   TypeScript will help catch missing migrations
-   If `migrateStoredState` doesn't return `LatestStoredState`, you missed a migration
-   Use TypeScript's union discrimination on `version` field

### Checkpoints

When the `AnyStoredState` union gets too large (causing TypeScript performance issues), create a checkpoint:

```typescript
// Flatten a range of versions to reduce union complexity
export interface StoredStateCheckpoint2 {
    version: 50
    // ... all fields from V50 flattened here
}
```

See `StoredStateCheckpoint1` (V33) for an example.

## Checklist

Before submitting your PR, verify:

-   [ ] New `StoredStateVX` interface created in `types/storage.ts`
-   [ ] `AnyStoredState` union includes new version
-   [ ] `LatestStoredState` type alias updated
-   [ ] Migration logic added to `migrateStoredState` function
-   [ ] `transformStateToStorage` updated with new fields and version number
-   [ ] `hasStorageStateChanged` updated with new field paths
-   [ ] Redux slice handles `loadFromStorage.fulfilled` (if needed)
-   [ ] Default values provided for new fields
-   [ ] Migration tested with old storage versions
-   [ ] TypeScript compiles without errors
-   [ ] No user data is lost during migration

## Example: Complete Migration

Here's a complete example of adding a new `showNotifications` field:

```typescript
// 1. types/storage.ts
export interface StoredStateV41 extends Omit<StoredStateV40, 'version'> {
    version: 41
    showNotifications: boolean
}

export type AnyStoredState =
    | OldStoredState
    // ... other versions ...
    | StoredStateV40
    | StoredStateV41

export type LatestStoredState = StoredStateV41

// 2. utils/storage.ts - transformStateToStorage
export function transformStateToStorage(state: CommonState): LatestStoredState {
    const transformedState: LatestStoredState = {
        version: 41,
        // ... existing fields ...
        showNotifications: state.environment.showNotifications,
    }
    return transformedState
}

// 3. utils/storage.ts - migrateStoredState
if (migrationState.version === 40) {
    migrationState = {
        ...migrationState,
        version: 41,
        showNotifications: true, // Default to enabled
    }
}

// 4. utils/storage.ts - hasStorageStateChanged
const keysetsToCheck = [
    // ... existing keys ...
    ['environment', 'showNotifications'],
]

// 5. redux/environment.ts - handle loading
extraReducers: builder => {
    builder.addCase(loadFromStorage.fulfilled, (state, action) => {
        if (action.payload) {
            // ... existing field loading ...
            state.showNotifications = action.payload.showNotifications ?? true
        }
    })
}
```

## Questions?

If you're unsure about your migration:

1. Look at recent migrations (V35-V40) for examples
2. Ask in the team chat before implementing
3. Have someone review your migration logic carefully

Remember: Storage migrations are permanent once released. Test thoroughly!
