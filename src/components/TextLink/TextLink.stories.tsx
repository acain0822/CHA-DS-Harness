import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextLink, type TextLinkVariation } from './TextLink';

const FIGMA =
  'https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-?node-id=1-6451';

const meta = {
  title: 'Components/Actions/Text Link',
  component: TextLink,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA },
    docs: {
      description: {
        component:
          'Navigation to another page or section. Use **light** on dark backgrounds and **dark** where the blue link colour clashes. Link text should say where it goes ("View trash pickup schedule"), not "click here".',
      },
    },
  },
  args: { href: '#', children: 'Text Links', variation: 'default' },
  argTypes: { variation: { control: 'inline-radio', options: ['default', 'light', 'dark'] } },
} satisfies Meta<typeof TextLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Light: Story = { args: { variation: 'light' }, globals: { backgrounds: { value: 'blue' } } };
export const Dark: Story = { args: { variation: 'dark' } };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } };
export const Disabled: Story = { args: { disabled: true } };

const STATES = ['default', 'hover', 'focus', 'disabled'] as const;
const VARIATIONS: TextLinkVariation[] = ['default', 'dark', 'light'];

export const AllVariants: Story = {
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    pseudo: { hover: ['.pseudo-hover'], focusVisible: ['.pseudo-focus'] },
  },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${STATES.length}, max-content)`, gap: '24px 40px', alignItems: 'center', padding: 24, fontFamily: 'var(--font-body)', fontSize: 14 }}>
      <span />
      {STATES.map((s) => (
        <strong key={s} style={{ textTransform: 'capitalize' }}>{s}</strong>
      ))}
      {VARIATIONS.map((v) => (
        <div key={v} style={{ display: 'contents' }}>
          <span>{v}</span>
          {STATES.map((s) => (
            <div key={s} style={{ padding: 8, background: v === 'light' ? 'var(--backgrounds-background-secondary)' : undefined }}>
              <TextLink href="#" variation={v} disabled={s === 'disabled'} className={`pseudo-${s}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
};
