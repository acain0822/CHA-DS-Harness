# Story patterns

Stories use Component Story Format 3 (CSF3). Every component gets the same shape so the sidebar is predictable for designers and the screenshot set is predictable for CI.

Sidebar titles follow the Figma page structure: `Foundations/Colors`, `Components/Actions/Button`, `Patterns/Forms/Login`.

## Component stories

```tsx
// src/components/Button/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const FIGMA = 'https://www.figma.com/design/<fileKey>/<name>?node-id=123-456';

const meta = {
  title: 'Components/Actions/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA },
    docs: {
      description: {
        component:
          'Primary actions on a page. Use one primary button per view; use `ghost` for low-emphasis actions. Not for navigation — use Link.',
      },
    },
  },
  args: { label: 'Submit', variant: 'primary', size: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// One story per meaningful variant value
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };

// States
export const Disabled: Story = { args: { disabled: true } };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } };
export const LongLabel: Story = {
  args: { label: 'A much longer label than designers expected, to check wrapping' },
};

// The VR workhorse: the full variant grid, mirroring the Figma component set
export const AllVariants: Story = {
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } },
  render: (args) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 16 }}>
      {(['primary', 'secondary', 'ghost'] as const).flatMap((variant) =>
        (['sm', 'md', 'lg'] as const).map((size) => (
          <Button key={`${variant}-${size}`} {...args} variant={variant} size={size} />
        )),
      )}
    </div>
  ),
};
```

Notes:
- Import the framework package the project actually uses (`@storybook/react-vite`, `@storybook/vue3-vite`, `@storybook/web-components-vite`, `@storybook/html-vite`).
- Pseudo-state stories need `storybook-addon-pseudo-states`. Without it, render the state with a forced class (`data-state="hover"`) that the component's CSS also targets.
- For components with many variant properties, the matrix gets large. Split into one `AllVariants` per main variant (e.g. `AllSizesPrimary`, `AllSizesSecondary`) once a grid would exceed roughly 40 cells, so a diff stays readable.
- Give interaction-heavy components (Menu, Modal, Combobox) a `play` function that opens them, so the screenshot captures the open state.

## Foundations pages

Foundations are MDX docs pages fed by the generated `tokens.ts`, so they never drift from the tokens.

```mdx
{/* src/foundations/Colors.mdx */}
import { Meta, ColorPalette, ColorItem } from '@storybook/addon-docs/blocks';
import { tokens } from '../tokens/tokens';

<Meta title="Foundations/Colors" />

# Colors

Every color comes from a Figma variable. Use the CSS variable, never the raw value.

<ColorPalette>
  {Object.entries(tokens.color).map(([group, shades]) => (
    <ColorItem
      key={group}
      title={group}
      subtitle={`--color-${group}-*`}
      colors={shades}
    />
  ))}
</ColorPalette>
```

- Typography: use the `Typeset` block, or render each text style with its name, size, line height and weight.
- Spacing and radius: render boxes sized by each token with the token name beside it.
- MDX pages are not screenshotted by default. For VR coverage of foundations, also add a small `Foundations/Colors` story file that renders the same grid, tagged `vr`.

## Theme modes

Register themes in `.storybook/preview.ts`:

```ts
import '../src/tokens/tokens.css';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (Story, { globals }) => {
      document.documentElement.dataset.theme = globals.theme;
      return Story();
    },
  ],
};
export default preview;
```

`tokens.css` puts each mode under `[data-theme="<mode>"]`, so this decorator is all a story needs.
