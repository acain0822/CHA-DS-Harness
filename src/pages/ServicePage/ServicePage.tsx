import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { TextLink } from '../../components/TextLink/TextLink';
import './ServicePage.css';

/*
 * Sandbox page, not part of the design system or any product. Change it freely
 * for whatever you're trying out; nothing depends on it, and its content is
 * sample text. The call to action here is a page layout, not the Figma CTA
 * component, which has no saved design context yet.
 */
const NEEDS = [
  'The street address or nearest intersection',
  'A short description of the pothole',
  'A photo, if you can safely take one',
];

export function ServicePage() {
  const [started, setStarted] = useState(false);

  return (
    <main className="service-page">
      <header className="service-page__intro">
        <div className="service-page__inner">
          <h1 className="service-page__title">Report a pothole</h1>
          <p className="service-page__lede">
            Tell us where a road needs repair. It takes about two minutes.
          </p>
        </div>
      </header>

      <section className="service-page__section" aria-labelledby="needs-heading">
        <div className="service-page__inner">
          <h2 id="needs-heading" className="service-page__heading">What you'll need</h2>
          <ul className="service-page__list">
            {NEEDS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <TextLink href="#">How we prioritize road repairs</TextLink>
        </div>
      </section>

      <section className="service-page__cta" aria-labelledby="cta-heading">
        <div className="service-page__inner">
          <h2 id="cta-heading" className="service-page__heading">Ready to report it?</h2>
          <p className="service-page__body">You don't need an account to send a report.</p>
          <Button label="Start your report" onClick={() => setStarted(true)} />
          <p className="service-page__status" role="status">
            {started ? 'This is a test page, so no report was started.' : ''}
          </p>
        </div>
      </section>
    </main>
  );
}
