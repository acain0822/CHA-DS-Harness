import type { Meta, StoryObj } from '@storybook/react-vite';
import { ServicePage } from './ServicePage';

const meta = {
  title: 'Pages/Test Service Page',
  component: ServicePage,
  // A harness test, not part of the design system, so no visual baseline.
  tags: ['!vr', '!autodocs'],
  parameters: { layout: 'fullscreen', controls: { disable: true } },
} satisfies Meta<typeof ServicePage>;

export default meta;
export const ReportAPothole: StoryObj<typeof meta> = { name: 'Report a Pothole' };
