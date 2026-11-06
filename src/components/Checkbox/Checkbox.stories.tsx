import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

const FIGMA =
  'https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-?node-id=168-11272';

const meta = {
  title: 'Components/Forms/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA },
    docs: {
      description: {
        component:
          'Lets people pick any number of options from a list, or toggle one setting that takes effect on submit. Use Radio Button when only one option can be chosen.',
      },
    },
  },
  args: { label: 'Label', showLabel: true },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const WithHelperText: Story = { args: { helperText: 'Helper text would go here and is optional' } };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } };
export const FocusChecked: Story = { args: { defaultChecked: true }, parameters: { pseudo: { focusVisible: true } } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, defaultChecked: true } };
export const LongLabel: Story = {
  args: { label: 'I agree to receive email updates about city council meetings in my district' },
  decorators: [(S) => <div style={{ maxWidth: 320 }}><S /></div>],
};

/* Mirrors the Figma set: Default, Hover, Active (checked), Focus × 2, Disabled × 2 */
const CELLS = [
  { key: 'default', label: 'Default' },
  { key: 'hover', label: 'Hover', cls: 'pseudo-hover' },
  { key: 'checked', label: 'Checked', checked: true },
  { key: 'focus', label: 'Focus', cls: 'pseudo-focus' },
  { key: 'focus-checked', label: 'Focus, checked', cls: 'pseudo-focus', checked: true },
  { key: 'disabled', label: 'Disabled', disabled: true },
  { key: 'disabled-checked', label: 'Disabled, checked', disabled: true, checked: true },
];

export const AllVariants: Story = {
  tags: ['!autodocs'],
  parameters: {
    controls: { disable: true },
    pseudo: { hover: ['.pseudo-hover label'], focusVisible: ['.pseudo-focus input'] },
  },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '160px max-content', gap: '20px 24px', alignItems: 'center', padding: 24, fontFamily: 'var(--font-body)', fontSize: 14 }}>
      {CELLS.map((c) => (
        <div key={c.key} style={{ display: 'contents' }}>
          <span>{c.label}</span>
          <Checkbox className={c.cls} defaultChecked={c.checked} disabled={c.disabled} label="Label" />
        </div>
      ))}
    </div>
  ),
};
