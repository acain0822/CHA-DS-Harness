import type { Meta, StoryObj } from '@storybook/react-vite';
import { InputField } from './InputField';

const FIGMA =
  'https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-?node-id=168-10459';

const meta = {
  title: 'Components/Forms/Input Field',
  component: InputField,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA },
    docs: {
      description: {
        component:
          'Single-line text entry. Always give it a visible label. Use help text for format hints ("MM/DD/YYYY") instead of relying on placeholder text, which disappears as people type. For multiple lines use Textarea.',
      },
    },
  },
  args: { label: 'Label', placeholder: 'Enter Name', isRequired: true },
  decorators: [
    (S, { parameters }) => (parameters.matrix ? <S /> : <div style={{ width: 440, maxWidth: '100%' }}><S /></div>),
  ],
} satisfies Meta<typeof InputField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: 'Placeholder' } };
export const WithHelpText: Story = { args: { helpText: 'Optional help text would go here' } };
export const Active: Story = { args: { defaultValue: 'Placeholder' }, parameters: { pseudo: { hover: true } } };
export const Focus: Story = { args: { defaultValue: 'Placeholder' }, parameters: { pseudo: { focus: true, focusWithin: true } } };
export const Disabled: Story = { args: { disabled: true, placeholder: 'Placeholder' } };
export const ErrorState: Story = {
  name: 'Error',
  args: { helpText: 'Optional help text would go here', error: 'Optional help text would go here' },
};
export const Optional: Story = { args: { isRequired: false } };

const CELLS = [
  { key: 'default', label: 'Default' },
  { key: 'active', label: 'Active (hover)', cls: 'pseudo-hover', value: 'Placeholder' },
  { key: 'focus', label: 'Focus', cls: 'pseudo-focus', value: 'Placeholder' },
  { key: 'disabled', label: 'Disabled', disabled: true },
  { key: 'error', label: 'Error', error: 'Optional help text would go here', help: 'Optional help text would go here' },
];

export const AllVariants: Story = {
  tags: ['!autodocs'],
  parameters: {
    matrix: true,
    controls: { disable: true },
    pseudo: {
      hover: ['.pseudo-hover input'],
      focus: ['.pseudo-focus input'],
      focusWithin: ['.pseudo-focus .cha-input__frame'],
    },
  },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 440px', gap: '32px 24px', alignItems: 'start', padding: 24, fontFamily: 'var(--font-body)', fontSize: 14 }}>
      {CELLS.map((c) => (
        <div key={c.key} style={{ display: 'contents' }}>
          <span style={{ paddingTop: 8 }}>{c.label}</span>
          <InputField
            className={c.cls}
            label="Label"
            isRequired
            placeholder={c.disabled ? 'Placeholder' : 'Enter Name'}
            defaultValue={c.value}
            disabled={c.disabled}
            error={c.error}
            helpText={c.help}
          />
        </div>
      ))}
    </div>
  ),
};
