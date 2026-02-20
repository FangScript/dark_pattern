# Midscene.js UI Customization Guide

## Overview

Midscene.js uses a modern React-based UI architecture with the following technologies:
- **React + TypeScript** for components
- **Ant Design (antd)** for UI components
- **Less** for styling
- **react-resizable-panels** for layout management

## UI Applications

The project contains multiple UI applications:

1. **Report App** (`apps/report/`) - Visualization tool for automation execution reports
2. **Playground** (`apps/playground/`) - Testing playground for automation
3. **Android Playground** (`apps/android-playground/`) - Android device automation playground
4. **Chrome Extension** (`apps/chrome-extension/`) - Browser extension UI
5. **Recorder Form** (`apps/recorder-form/`) - Form for recording automation

## Customization Areas

### 1. Theme Colors

**Location**: `packages/visualizer/src/utils/color.ts`

The main theme configuration is in `globalThemeConfig()`:

```typescript
export function globalThemeConfig(): ThemeConfig {
  return {
    token: {
      colorPrimary: '#2B83FF', // Primary blue color
    },
    components: {
      Layout: {
        headerHeight: 60,
        headerPadding: '0 30px',
        headerBg: '#FFF',
        bodyBg: '#FFF',
      },
    },
  };
}
```

**To customize**: Modify the `colorPrimary` value and other theme tokens.

### 2. Color Variables (Less)

**Location**: `apps/report/src/components/common.less`

Key color variables:
```less
@primary-color: #2B83FF;        // Primary color
@main-orange: #F9483E;          // Accent orange
@side-bg: #f2f4f7;             // Sidebar background
@border-color: rgba(0, 0, 0, 0.08);
@selected-bg: #bfc4da80;       // Selected item background
@hover-bg: #dcdcdc80;          // Hover background
@weak-bg: #F3F3F3;             // Weak background
@weak-text: rgba(0, 0, 0, 0.65); // Weak text color
```

**To customize**: Change these variables to update colors across the app.

### 3. Component Styling

Each app has its own Less files:
- `apps/report/src/App.less` - Report app styles
- `apps/playground/src/App.less` - Playground styles
- `apps/android-playground/src/App.less` - Android playground styles

**To customize**: Edit the Less files to change:
- Layout spacing
- Border radius
- Shadows
- Background colors
- Typography

### 4. Layout Structure

The apps use `react-resizable-panels` for resizable layouts:

**Report App** (`apps/report/src/App.tsx`):
- Sidebar panel (25% default)
- Main content panel (75% default)
- Detail panel with resizable split

**Playground** (`apps/playground/src/App.tsx`):
- Left panel: Universal Playground (32% default)
- Right panel: Screenshot Viewer (68% default)

**To customize**: Modify the `defaultSize` props in `Panel` components.

### 5. Typography

Font family is set in Less files:
```less
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 
             Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
font-size: 14px;
```

**To customize**: Change font-family and font-size in the Less files.

### 6. Branding

**Logo Component**: `packages/visualizer/src/component/logo/`

**To customize**: Replace the logo component or modify its styling.

## Quick Customization Examples

### Change Primary Color

1. Edit `packages/visualizer/src/utils/color.ts`:
```typescript
token: {
  colorPrimary: '#YOUR_COLOR', // e.g., '#FF6B6B' for red
}
```

2. Edit `apps/report/src/components/common.less`:
```less
@primary-color: #YOUR_COLOR;
```

### Change Background Colors

Edit `apps/report/src/App.less`:
```less
.page-side {
  background: #YOUR_COLOR; // Sidebar background
}

.main-right {
  background: #YOUR_COLOR; // Main content background
}
```

### Change Border Radius

Edit the Less files to modify border-radius values:
```less
.main-right {
  border-radius: 8px; // Change from 16px to 8px for sharper corners
}
```

### Change Layout Proportions

Edit `apps/report/src/App.tsx`:
```typescript
<Panel defaultSize={30} maxSize={95}> // Change from 25 to 30
```

## Component Structure

### Shared Components (packages/visualizer/src/component/)
- `logo/` - Logo component
- `player/` - Video/execution player
- `playground/` - Playground UI
- `universal-playground/` - Universal playground component
- `nav-actions/` - Navigation actions
- `env-config/` - Environment configuration
- `prompt-input/` - Input component
- `blackboard/` - Blackboard component

### App-Specific Components
- `apps/report/src/components/` - Report-specific components
- `apps/playground/src/components/` - Playground-specific components
- `apps/android-playground/src/components/` - Android playground components

## Best Practices

1. **Use Less variables** for colors to maintain consistency
2. **Modify theme config** for Ant Design component styling
3. **Test across all apps** if making global changes
4. **Maintain accessibility** when changing colors (contrast ratios)
5. **Use CSS variables** for runtime theme switching (if needed)

## Testing Changes

After making UI changes:
1. Run `pnpm dev` to start development server
2. Test in each app:
   - Report: `apps/report`
   - Playground: `apps/playground`
   - Android Playground: `apps/android-playground`
3. Check responsive behavior (narrow screen layouts)

## Additional Resources

- Ant Design Theme: https://ant.design/docs/react/customize-theme
- Less Documentation: https://lesscss.org/
- React Resizable Panels: https://github.com/bvaughn/react-resizable-panels




