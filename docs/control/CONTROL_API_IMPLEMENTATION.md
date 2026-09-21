# Control API Implementation Guide

## What's Been Designed

I've created a complete design and initial implementation for the Brainsonify Control API library. This provides a decoupled parameter management system that will allow keyboard, mouse wheel, and eventual hardware controller input.

## Files Created (in cloud workspace)

### 1. `/libs/control/src/schema.ts` (350+ lines)
**Purpose**: Define all control parameters and their metadata

**Key Features**:
- `ControlParameter` interface with complete metadata
  - Type validation (float, int, enum, boolean)
  - Min/max ranges, step sizes, units
  - Channel and mode affinity
  - Description and sensitivity
- `CONTROL_SCHEMA` - Registry of all 18 control parameters
- Helper functions:
  - `validateParameter()` - Type and range validation
  - `clampParameter()` - Clamp values to valid ranges
  - `getParametersForChannel()` - Filter by experiment channel
  - `getParametersForMode()` - Filter by audio mode

**Parameters Defined**:
- Audio: `mode`, `lowHz`, `octaves`
- Volume: `gate`, `volume`, `glide`
- Spatial: `width`, `spread`
- Rhythm: `taps`, `rate`, `spike`
- 3D: `depth`, `clip`
- Sweep: `sweepLine`, `sweepLines`, `sweepRest`, `sweepDir`
- Toggles: `tapsOnly`, `render3d`

### 2. `/libs/control/src/state.ts` (100+ lines)
**Purpose**: State management and utilities

**Key Features**:
- `ControlState` interface - Complete state snapshot
- `DEFAULT_STATE` - All parameters at baseline
- Utility functions:
  - `cloneState()` - Deep copy
  - `getStateDiff()` - Find differences
  - `statesEqual()` - Equality check
  - `mergeState()` - Partial update

### 3. `/libs/control/src/controller.ts` (400+ lines)
**Purpose**: Main Control API class

**Key Methods**:
```typescript
// Get/Set individual parameters
getParameter(id: string): any
setParameter(id: string, value: any): boolean

// Batch operations
getState(): ControlState
setState(partial: Partial<ControlState>): string[]

// Experiment support
applyExperiment(experiment: Experiment, overrides?: Partial<ControlState>): void

// Event subscriptions
onParameterChange(id: string, listener: ParameterChangeListener): () => void
onStateChange(listener: StateChangeListener): () => void
onExperimentApplied(listener: ExperimentAppliedListener): () => void

// History & persistence
undo(): boolean
clearHistory(): void
toJSON(): string
fromJSON(json: string): boolean
```

**Features**:
- Full validation and type checking
- Automatic value clamping to valid ranges
- Event system with unsubscribe functions
- Change history (max 20 states)
- JSON serialization for persistence
- Experiment application support

### 4. `/libs/control/src/index.ts` (30 lines)
**Purpose**: Public API exports

Exports:
- `ControlAPI` class
- Type definitions
- Schema functions and constants
- State utilities

## Next Steps for Implementation

### Step 1: Copy to Repository
Create a new branch and copy the control library files to `/libs/control/` in your repository:

```bash
cd ~/Dev/brainsonify
git checkout -b feat/control-api
# Copy the files from the cloud workspace into libs/control/src/
```

### Step 2: Create Library Configuration Files

Need to create:
- `libs/control/tsconfig.json` - TypeScript config
- `libs/control/project.json` - Nx project config  
- `libs/control/package.json` - Package metadata
- `libs/control/vitest.config.ts` - Test configuration

### Step 3: Update Root Monorepo Files

Modify these in your repo:
- `tsconfig.base.json` - Add path alias for `@brainsonify/control`
- `nx.json` - Register new library (if using Nx)
- Root `package.json` - May need updates

### Step 4: Write Unit Tests

Create test files for:
- `libs/control/src/schema.spec.ts` - Parameter validation
- `libs/control/src/controller.spec.ts` - ControlAPI behavior
- `libs/control/src/state.spec.ts` - State utilities

### Step 5: Create VirtualController

After the core API is tested, create:
```
apps/brainsonify/src/controllers/virtual-controller.ts

export class VirtualController {
  constructor(api: ControlAPI)
  onKeyDown(event: KeyboardEvent): void
  onKeyUp(event: KeyboardEvent): void
  onWheel(event: WheelEvent): void
  setKeyMap(config: KeyMapConfig): void
  focus(parameterId: string): void
}
```

### Step 6: Integrate with Existing UI

Refactor `apps/brainsonify/src/ui.ts` to use ControlAPI:
- Replace direct HTML element access with API calls
- Subscribe to ControlAPI events instead of DOM events
- Remove duplicate state management

### Step 7: Update main.ts

Modify `apps/brainsonify/src/main.ts` to:
- Instantiate `ControlAPI`
- Create `VirtualController` and wire events
- Subscribe to control changes and feed to Sonifier
- Apply experiments using `api.applyExperiment()`

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    Applications                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Brainsonify Frontend                                 │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ Input Handlers                                   │ │   │
│  │  │ ├─ VirtualController (keyboard/wheel)           │ │   │
│  │  │ ├─ CrowPanelController (future hardware)        │ │   │
│  │  │ └─ Pointer/UI Controls                          │ │   │
│  │  └────────────┬────────────────────────────────────┘ │   │
│  └───────────────┼──────────────────────────────────────┘   │
│                  │ calls API methods                         │
│                  ▼                                           │
├─────────────────────────────────────────────────────────────┤
│                   Control API                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ControlAPI (libs/control)                            │   │
│  │ ├─ Parameter validation & clamping                  │   │
│  │ ├─ State management                                 │   │
│  │ ├─ Event emission                                   │   │
│  │ ├─ History & undo                                   │   │
│  │ └─ Persistence (JSON import/export)                 │   │
│  └────────┬──────────────────────────────────┬─────────┘   │
│           │ emits events                     │ provides     │
│           │                                  │ state        │
└────────┬──┼──────────────────────────────────┼──────────────┘
         │  ▼                                  ▼
    ┌────────────────────────────────────────────────┐
    │     Audio Engine (libs/sonification)          │
    │     ├─ Sonifier class                         │
    │     ├─ Pitch mapping                          │
    │     ├─ Pan & depth                            │
    │     └─ Rhythm generation                      │
    └────────────────────────────────────────────────┘
```

## Benefits of This Design

1. **Decoupling**: UI, input controllers, and audio engine are independent
2. **Testability**: Each component can be tested in isolation
3. **Reusability**: Same API works with keyboard, mouse, or hardware
4. **Extensibility**: Easy to add new parameters or input methods
5. **Persistence**: Can save/load control configurations
6. **Accessibility**: Keyboard-only operation becomes possible
7. **Future-Ready**: Hardware knob can be plugged in seamlessly

## Estimated Implementation Time

- Core library setup (config files, tests): 2-3 hours
- VirtualController: 1-2 hours
- UI refactoring: 2-3 hours
- Integration testing: 1-2 hours
- **Total**: ~6-10 hours of work

## Code Quality Targets

- TypeScript strict mode enabled
- >80% unit test coverage
- JSDoc comments on public API
- Error handling for all edge cases
- No console.errors in normal operation
