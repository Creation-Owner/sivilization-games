export default function TermsPrivacyPage({ onBack }) {
  return (
    <section className="content-section legal-page">
      <button className="button button-secondary" type="button" onClick={onBack}>
        ← Back
      </button>

      <header className="section-heading">
        <p className="eyebrow">Sivilization</p>
        <h1>Terms & privacy</h1>
        <p>Review the terms and privacy information for this service.</p>
      </header>

      <article className="legal-card">
        <h2>Terms of use</h2>
        <p>
          Sivilization provides a platform for discovering films, games, and
          products. Access to content may be subject to account, availability,
          and purchase requirements displayed in the service.
        </p>
        <p>
          Do not upload content unless you have the rights and permissions
          required to distribute it. We may remove content that violates
          applicable law or these terms.
        </p>

        <h2>Privacy notice</h2>
        <p>
          The application uses Supabase authentication and database services.
          Account information and information you submit may be processed to
          provide and secure the service. Do not enter sensitive personal
          information into free-form fields.
        </p>
        <p>
          Replace this starter notice with a complete notice covering the
          information collected, purposes, service providers, retention,
          security, user rights, and contact details before production use.
        </p>

        <h2>Contact</h2>
        <p>
          Add a monitored support email address and the applicable legal
          business details here before launch.
        </p>
      </article>
    </section>
  );
}