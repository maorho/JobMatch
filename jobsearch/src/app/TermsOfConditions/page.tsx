import { PageHeader } from "../components/ui";

export default function TermsOfCondintions() {
  return (
    <div className="jm-page">
      <div className="max-w-3xl mx-auto">
        <PageHeader eyebrow="Terms of Use" title="Welcome to JobMatch" subtitle="Last Updated: 10/04/2025" />

        <article className="jm-card p-6 sm:p-10 space-y-6 [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky">
          {/* פסקה ראשונה */}
          <p className="text-base sm:text-lg">
            By accessing or using our website, application, or any other services
            we provide (collectively, the &quot;Platform&quot;), you agree to comply with
            and be bound by these Terms of Use (the &quot;Terms&quot;). If you do not agree
            to these Terms, please do not use our Platform.
          </p>

          {/* סעיפים */}
          <div>
            <h2 className="first:mt-0">1. Eligibility</h2>
            <p>
              You must be at least 18 years old or the legal age of majority in
              your jurisdiction to use this Platform. By using our Platform, you
              represent and warrant that you meet these eligibility requirements.
            </p>

            <h2>2. Account Registration</h2>
            <p>
              To use certain features of the Platform, you may be required to
              create an account. You agree to provide accurate, current, and
              complete information during the registration process and to update
              such information to keep it accurate. You are responsible for
              maintaining the confidentiality of your account credentials and for
              all activities that occur under your account.
            </p>

            <h2>3. Use of the Platform</h2>
            <p>
              You agree to use the Platform in a lawful manner and for lawful
              purposes only. You shall not: Engage in any activity that violates
              the rights of others, including but not limited to harassment,
              impersonation, or infringement of intellectual property. Upload,
              post, or transmit content that is unlawful, offensive, or violates
              the rights of any person or entity. Attempt to interfere with or
              disrupt the Platform or servers connected to the Platform.
            </p>

            <h2>4. Privacy</h2>
            <p>
              Your use of the Platform is governed by our Privacy Policy, which
              can be found{" "}
              <a href="#">
                here
              </a>
              . Please review the Privacy Policy to understand how we collect,
              use, and protect your information.
            </p>

            <h2>5. User Content</h2>
            <p>
              You are solely responsible for any content you post, upload, or
              share on the Platform, including your profile, messages, and other
              materials (&quot;User Content&quot;). You grant us a worldwide, royalty-free,
              and non-exclusive license to use, display, and distribute your User
              Content as necessary to operate and improve the Platform.
            </p>

            <h2>6. Prohibited Activities</h2>
            <p>
              You agree not to: Use the Platform to transmit any viruses, malware,
              or other harmful code. Engage in spamming, phishing, or other
              deceptive practices. Collect personal data of other users without
              their consent. Use automated tools (e.g., bots, scrapers) to access
              or interact with the Platform without permission.
            </p>

            <h2>7. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account and access
              to the Platform at our discretion, including for violations of these
              Terms or any applicable law.
            </p>

            <h2>8. Disclaimers</h2>
            <p>
              The Platform is provided &quot;as is&quot; without any warranties, express or
              implied. We do not guarantee the accuracy, reliability, or
              availability of the Platform, and we are not responsible for any
              content posted by users.
            </p>

            <h2>9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, we will not be liable for
              any indirect, incidental, special, consequential, or punitive
              damages arising out of your use of the Platform.
            </p>

            <h2>10. Governing Law</h2>
            <p>
              These Terms will be governed by and construed in accordance with the
              laws of [Jurisdiction], without regard to its conflict of law
              principles.
            </p>

            <h2>11. Changes to Terms</h2>
            <p>
              We reserve the right to update or modify these Terms at any time.
              Any changes will be posted on this page with an updated revision
              date. Your continued use of the Platform after such changes
              constitutes your acceptance of the modified Terms.
            </p>

            <h2>12. Contact Us</h2>
            <p>
              If you have any questions about these Terms or the Platform, please
              contact us at{" "}
              <a href="mailto:maorhomri1@gmail.com">
                maorhomri1@gmail.com
              </a>
              .
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
