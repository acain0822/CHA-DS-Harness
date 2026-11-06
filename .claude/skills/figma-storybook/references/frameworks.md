# Other frameworks

The workflow is the same in every framework; only the component syntax, the Storybook framework package and the slot mechanism change.

| | React + TS | Vue 3 | Web Components (Lit) | Plain HTML |
|---|---|---|---|---|
| Storybook package | `@storybook/react-vite` | `@storybook/vue3-vite` | `@storybook/web-components-vite` | `@storybook/html-vite` |
| Variant → | union-typed prop | `defineProps` union | `@property({ reflect: true })` attribute | CSS modifier class `btn--primary` |
| Boolean → | `boolean` prop | `boolean` prop | boolean attribute | modifier class or attribute |
| Instance swap → | `ReactNode` prop | named `<slot>` | named `<slot>` | nested markup |
| Code Connect | yes | limited | via HTML parser | via HTML parser |

## Vue

```ts
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from './Button.vue';

const meta = { title: 'Components/Actions/Button', component: Button, tags: ['autodocs'] } satisfies Meta<typeof Button>;
export default meta;

export const AllVariants: StoryObj<typeof meta> = {
  render: () => ({
    components: { Button },
    setup: () => ({ variants: ['primary', 'secondary', 'ghost'], sizes: ['sm', 'md', 'lg'] }),
    template: `<div style="display:grid;grid-template-columns:repeat(3,max-content);gap:16px">
      <template v-for="v in variants"><Button v-for="s in sizes" :key="v+s" :variant="v" :size="s" label="Submit" /></template>
    </div>`,
  }),
};
```

## Web Components

Good choice when the design system must serve several apps built in different frameworks (common for city or enterprise systems). Use Lit; reflect variant properties to attributes so CSS can style `:host([variant="primary"])`. Register the custom elements in `.storybook/preview.ts` by importing the component index.

```ts
import { html } from 'lit';
export const AllVariants = {
  render: () => html`<div style="display:grid;grid-template-columns:repeat(3,max-content);gap:16px">
    ${['primary', 'secondary', 'ghost'].flatMap((v) =>
      ['sm', 'md', 'lg'].map((s) => html`<ds-button variant=${v} size=${s}>Submit</ds-button>`))}
  </div>`,
};
```

Note: shadow DOM scopes styles, so `tokens.css` custom properties still reach components (custom properties inherit through the shadow boundary), but global utility classes do not.

## Plain HTML / CSS

Stories return HTML strings. Components are CSS classes plus markup conventions; document the required markup in each component's docs page, since there is no prop API to autodocs.
