import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, type ButtonType, type ButtonSize } from './Button';

const FIGMA =
  'https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-?node-id=150-10522';

const meta = {
  title: 'Components/Actions/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA },
    docs: {
      description: {
        component:
          'Actions on a page. **Primary** is the main call to action (one per view). **Outline** is a secondary action; use **Outline on dark** over blue or image backgrounds. **Ghost** is the lowest emphasis. Use Text Link, not Button, for navigation.',
      },
    },
  },
  args: { label: 'Button', variant: 'primary', size: 'large', iconRight: true },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'outline', 'outline-on-dark', 'ghost'] },
    size: { control: 'inline-radio', options: ['large', 'small'] },
    iconLeft: { control: 'boolean' },
    iconRight: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const onDark = { backgrounds: { value: 'blue' } };

export const Default: Story = {};
export const Outline: Story = { args: { variant: 'outline' } };
export const OutlineOnDark: Story = { args: { variant: 'outline-on-dark' }, globals: onDark };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Small: Story = { args: { size: 'small' } };
export const IconLeft: Story = { args: { iconLeft: true, iconRight: false, label: 'Back' } };
export const NoIcon: Story = { args: { iconRight: false } };

export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } };
export const Active: Story = { parameters: { pseudo: { active: true } } };
export const Disabled: Story = { args: { disabled: true } };
export const LongLabel: Story = { args: { label: 'Apply for a building permit online' } };

/* Matrix mirroring the Figma component set: rows are Type × Size, columns are State. */
const STATES = ['default', 'hover', 'focus', 'active', 'disabled'] as const;
const ROWS: [ButtonType, ButtonSize][] = [
  ['primary', 'large'],
  ['outline', 'large'],
  ['ghost', 'large'],
  ['primary', 'small'],
  ['outline', 'small'],
];

function Matrix({ rows, dark = false }: { rows: [ButtonType, ButtonSize][]; dark?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `140px repeat(${STATES.length}, max-content)`,
        gap: '20px 32px',
        alignItems: 'center',
        padding: 24,
        background: dark ? 'var(--backgrounds-background-secondary)' : undefined,
        color: dark ? 'var(--white)' : undefined,
        fontFamily: 'var(--font-body)',
        fontSize: 14,
      }}
    >
      <span />
      {STATES.map((s) => (
        <strong key={s} style={{ textTransform: 'capitalize' }}>
          {s}
        </strong>
      ))}
      {rows.map(([variant, size]) => (
        <Row key={`${variant}-${size}`} variant={variant} size={size} />
      ))}
    </div>
  );
}

function Row({ variant, size }: { variant: ButtonType; size: ButtonSize }) {
  return (
    <>
      <span>
        {variant} / {size}
      </span>
      {STATES.map((state) => (
        <div key={state}>
          <Button
            variant={variant}
            size={size}
            disabled={state === 'disabled'}
            className={`pseudo-${state}`}
          />
        </div>
      ))}
    </>
  );
}

export const AllVariants: Story = {
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    pseudo: { hover: ['.pseudo-hover'], focusVisible: ['.pseudo-focus'], active: ['.pseudo-active'] },
  },
  render: () => <Matrix rows={ROWS} />,
};

export const AllVariantsOnDark: Story = {
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    pseudo: { hover: ['.pseudo-hover'], focusVisible: ['.pseudo-focus'], active: ['.pseudo-active'] },
  },
  render: () => <Matrix rows={[['outline-on-dark', 'large']]} dark />,
};
