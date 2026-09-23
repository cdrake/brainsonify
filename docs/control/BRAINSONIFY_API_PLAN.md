# Brainsonify Control API Design

## Overview
Transform Brainsonify from a tightly-coupled HTML UI system into a modular architecture with:
1. **Control API** - Decoupled parameter management layer
2. **Virtual Controller** - Keyboard and mouse wheel input mapping
3. **Hardware Integration Ready** - Socket for future CrowPanel knob controller

## Current State Analysis

### Existing Architecture
- **Audio Engine**: `libs/sonification/` exports Sonifier class
  - Takes VoiceState (freq, pan, depth, height, taps, open)
  - AudioSettings (mode, volume, glide)
- **UI Layer**: `apps/brainsonify/src/ui.ts` - Controls class
  - 18 HTML input elements directly bound
  - No state abstraction
  - No event system
- **11 Experiments**: Each with different channel mappings and defaults
  - Some control pitch, stereo width, depth, height, rhythm/bone taps, etc.

### Control Parameters Currently Exposed
From `Controls` class in ui.ts:
- `mode` - Mapping type (tone, noise, texture, taps)
- `lowHz` - Base frequency (Hz)
- `octaves` - Pitch range (octaves)
- `gate` - Gate threshold
- `volume` - Master volume (0..1)
- `glide` - Frequency slide time (seconds)
- `depth` - Surface depth for 3D voxel sampling
- `clip` - Depth clipping (0..1)
- `width` - Stereo field width
- `spread` - Depth field spread
- `taps` - Tap rate ceiling (taps/second)
- `rate` - Bone detection rate
- `spike` - Bone probe reach (mm)
- `tapsOnly` - Toggle tone+taps vs taps only
- `sweepLine` - Sweep pace (seconds per line)
- `sweepLines` - Lines per sweep pass
- `sweepRest` - Rest time between passes
- `sweepDir` - Sweep direction

## Proposed Architecture

### Phase 1: Core Control API

```
libs/control/
├── src/
│   ├── index.ts              # Public API exports
│   ├── controller.ts         # Main ControlAPI class
│   ├── schema.ts             # Parameter definitions & validation
│   ├── state.ts              # ControlState interface
│   ├── defaults.ts           # Default values per experiment
│   └── controller.spec.ts
```

#### Key Components

**ControlParameter Definition**:
```typescript
interface ControlParameter {
  id: string;                    // 'lowHz', 'volume', etc.
  name: string;                  // Display name
  type: 'float' | 'int' | 'enum' | 'boolean';
  defaultValue: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;                 // 'Hz', 'dB', 'ms', etc.
  affectedChannels?: string[];   // Which experiment channels use this
  allowedModes?: Mode[];         // Which modes this applies to
}
```

**ControlState**:
```typescript
interface ControlState {
  mode: Mode;
  lowHz: number;
  octaves: number;
  gate: number;
  volume: number;
  glide: number;
  depth: number;
  clip: number;
  width: number;
  spread: number;
  taps: number;
  rate: number;
  spike: number;
  tapsOnly: boolean;
  sweepLine: number;
  sweepLines: number;
  sweepRest: number;
  sweepDir: string;
}
```

**ControlAPI Class**:
```typescript
export class ControlAPI {
  // Get/Set individual parameters
  getParameter(id: string): number | string | boolean;
  setParameter(id: string, value: number | string | boolean): void;
  
  // Batch operations
  getState(): ControlState;
  setState(state: Partial<ControlState>): void;
  
  // Experiment presets
  applyExperiment(experiment: Experiment): void;
  
  // Events
  on(event: 'parameterChanged', listener: (id: string, value: any) => void): void;
  on(event: 'stateChanged', listener: (state: ControlState) => void): void;
  off(event: string, listener: Function): void;
  
  // Validation & constraints
  validateParameter(id: string, value: any): { valid: boolean; error?: string };
  getParameterDef(id: string): ControlParameter;
}
```

### Phase 2: Virtual Controller

```
apps/brainsonify/src/controllers/
├── virtual-controller.ts     # Keyboard/mouse wheel mapping
├── hardware-controller.ts    # (Future) CrowPanel integration
└── controllers.spec.ts
```

**VirtualController**:
```typescript
export class VirtualController {
  // Map keyboard keys to parameter adjustments
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;
  
  // Map mouse wheel to focused parameter
  onWheel(event: WheelEvent): void;
  
  // Configure key mappings
  setKeyMap(config: KeyMapConfig): void;
  
  // Focus which parameter mouse wheel controls
  focus(parameterId: string): void;
}
```

**Key Mapping Strategy**:
- Arrow keys: Navigate parameters (up/down), adjust value (left/right)
- Number keys: Direct values (1-9 for volume, gate, etc.)
- Mouse wheel: Fine adjust currently focused parameter
- Shift+wheel: Coarse adjust
- Space: Toggle (tapsOnly, render3d, etc.)

### Phase 3: UI Refactoring

Refactor `apps/brainsonify/src/ui.ts` to:
1. Use ControlAPI instead of direct HTML element manipulation
2. Subscribe to ControlAPI events
3. Update HTML only when values change
4. Separate concerns: data (ControlAPI) vs presentation (UI)

### Phase 4: Hardware Integration

Add `CrowPanelController` that:
1. Receives USB HID mouse wheel events from ESP32
2. Implements same interface as VirtualController
3. Maps encoder rotations to parameter changes
4. Can be swapped at runtime with VirtualController

## API Contracts

### ControlAPI Events
```typescript
// When individual parameter changes
api.on('parameterChanged', (id: string, value: any, prev: any) => {
  // id: 'lowHz', 'volume', etc.
  // value: new value
  // prev: previous value
});

// When entire state changes (batch operation)
api.on('stateChanged', (current: ControlState, previous: ControlState) => {
  // Full state replaced
});

// When experiment is applied
api.on('experimentApplied', (experiment: Experiment) => {
  // Experiment has been fully applied
});
```

### VirtualController Integration
```typescript
const api = new ControlAPI();
const keyboard = new VirtualController(api);

// Forward events
document.addEventListener('keydown', e => keyboard.onKeyDown(e));
document.addEventListener('wheel', e => keyboard.onWheel(e));

// Subscribe to changes
api.on('parameterChanged', (id, value) => {
  updateUIElement(id, value);
});
```

### Future Hardware Controller
```typescript
const crowpanelController = new CrowPanelController(api);
crowpanelController.connect('COM3'); // USB port

// Simple swap at runtime
let activeController: VirtualController | CrowPanelController = keyboard;
```

## Implementation Plan

### Week 1: Core API
1. Design and implement ControlParameter schema
2. Implement ControlAPI class with get/set/validate
3. Implement event system
4. Write comprehensive tests

### Week 2: Virtual Controller
1. Implement VirtualController with keyboard mapping
2. Implement mouse wheel focusing and adjustment
3. Test keyboard/mouse interaction
4. Document key bindings

### Week 3: UI Integration
1. Refactor Controls class to use ControlAPI
2. Update main.ts to use new architecture
3. Test that all 11 experiments work
4. Ensure no regressions in audio output

### Week 4: Polish & Hardware Prep
1. Add localStorage for user preferences
2. Create CrowPanelController skeleton
3. Document API for future hardware integration
4. Performance optimization if needed

## Benefits

1. **Decoupling**: Audio engine doesn't depend on HTML UI
2. **Testability**: Control logic can be unit tested separately
3. **Reusability**: Same API works with keyboard, mouse, or hardware
4. **Extensibility**: Easy to add new parameters or controllers
5. **Persistence**: Control state can be saved/loaded
6. **Accessibility**: Keyboard-only operation possible

## Risk Mitigation

- **HTML UI dependency**: Carefully refactor to avoid breaking existing functionality
- **Browser compatibility**: Virtual controller uses standard DOM events
- **Hardware timing**: CrowPanel integration adds USB stack complexity (future phase)
- **Performance**: Event-driven architecture should be efficient

## Success Criteria

1. ✅ ControlAPI fully implements all current controls
2. ✅ Virtual controller works with keyboard and mouse wheel
3. ✅ All 11 experiments function identically to before
4. ✅ Audio output unchanged (bit-for-bit or within acceptable variance)
5. ✅ Unit test coverage >80% for new modules
6. ✅ API documented and ready for hardware integration
