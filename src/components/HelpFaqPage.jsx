export default function HelpFaqPage({ onBack }) {
  const faqs = [
    {
      q: "What is Sivilization Shop?",
      a:
        "Sivilization Shop is a demo platform for stories, games, collectibles and interactive worlds. It combines media, shop, library and membership features in one place.",
    },
    {
      q: "Do I need an account to browse?",
      a:
        "You can browse most content without an account. To save items, manage a library, or use memberships, you need to be logged in.",
    },
    {
      q: "What is Demo Mode?",
      a:
        "Demo Mode is a local development mode that uses sample data stored in your browser. No real payments, subscriptions, or Supabase content are used in this mode.",
    },
    {
      q: "How does the Library work?",
      a:
        "The Library shows content you have saved, rented, purchased, or accessed through a subscription. In Demo Mode, it shows locally saved sample titles only.",
    },
    {
      q: "Can I cancel my membership?",
      a:
        "In a real deployment, you would manage and cancel memberships from the Subscriptions section. In Demo Mode, you can select and cancel sample plans locally.",
    },
  ];

  return (
    <section className="help-faq-page">
      <div className="help-faq-card">
        <button className="back-button" type="button" onClick={onBack}>
          ← Back to profile
        </button>

        <h1>Help & FAQ</h1>

        <p className="help-intro">
          Common questions about Sivilization Shop, accounts, library and
          memberships.
        </p>

        <div className="faq-list">
          {faqs.map((item, index) => (
            <details className="faq-item" key={index}>
              <summary className="faq-question">{item.q}</summary>
              <div className="faq-answer">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>

        <div className="help-contact-box">
          <h2>Still need help?</h2>

          <p>
            If you cannot find what you need here, you can reach out via the
            contact details on the{" "}
            <button
              type="button"
              className="inline-link-button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("open-about-contact"))
              }
            >
              About & Contact
            </button>{" "}
            page.
          </p>
        </div>
      </div>
    </section>
  );
}