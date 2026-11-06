import type { Preview } from '@storybook/react-vite';
import '../src/tokens/tokens.css';
import '../src/styles/responsive.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      options: {
        white: { name: 'White', value: '#ffffff' },
        blue: { name: 'Sky-70', value: '#18546e' },
        sand: { name: 'Sand', value: '#f5f5ec' },
      },
    },
    a11y: {
      // Report violations in the panel; switch to 'error' once the backlog is clear.
      test: 'todo',
    },
    options: {
      storySort: { order: ['Introduction', 'Foundations', 'Components'] },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'white' },
  },
};

export default preview;
