import { PageHeader } from "../components/ui";
import { Bilingual, LangBox } from "../lib/i18n/Bilingual";

/** Terms of use. Hebrew and English say the same thing; when one changes, change the other (and the date in both). */
export default function TermsOfCondintions() {
  return (
    <LangBox className="jm-page">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          eyebrow={<Bilingual he="תנאי שימוש" en="Terms of Use" />}
          title={<Bilingual he="ברוכים הבאים ל-JobMatch" en="Welcome to JobMatch" />}
          subtitle={<Bilingual he="עודכן לאחרונה: 10/04/2025" en="Last Updated: 10/04/2025" />}
        />

        <article className="jm-card p-6 sm:p-10 space-y-6 [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky">
          <Bilingual
            he={
              <>
                <p className="text-base sm:text-lg">
                  בגישה לאתר, לאפליקציה או לכל שירות אחר שאנחנו מספקים (יחד, &quot;הפלטפורמה&quot;) או בשימוש בהם, אתה מסכים לציית
                  לתנאי שימוש אלה (&quot;התנאים&quot;) ולהיות כפוף להם. אם אינך מסכים לתנאים, אנא אל תשתמש בפלטפורמה.
                </p>

                <div>
                  <h2 className="first:mt-0">1. זכאות</h2>
                  <p>
                    עליך להיות בן 18 לפחות, או בגיל הבגירות החוקי במקום מגוריך, כדי להשתמש בפלטפורמה. בשימוש בפלטפורמה אתה מצהיר
                    ומתחייב שאתה עומד בדרישות הזכאות האלה.
                  </p>

                  <h2>2. רישום חשבון</h2>
                  <p>
                    כדי להשתמש בחלק מתכונות הפלטפורמה ייתכן שתידרש ליצור חשבון. אתה מסכים למסור מידע מדויק, עדכני ומלא בתהליך הרישום
                    ולעדכן אותו כדי שיישאר מדויק. אתה אחראי לשמירה על סודיות פרטי ההתחברות שלך ולכל פעילות שמתבצעת בחשבונך.
                  </p>

                  <h2>3. שימוש בפלטפורמה</h2>
                  <p>
                    אתה מסכים להשתמש בפלטפורמה באופן חוקי ולמטרות חוקיות בלבד. אסור לך: לעסוק בפעילות שפוגעת בזכויות של אחרים, לרבות
                    הטרדה, התחזות או הפרת קניין רוחני. להעלות, לפרסם או להעביר תוכן בלתי חוקי, פוגעני או כזה שמפר זכויות של אדם או גוף
                    כלשהו. לנסות להפריע לפלטפורמה או לשרתים המחוברים אליה או לשבש אותם.
                  </p>

                  <h2>4. פרטיות</h2>
                  <p>
                    השימוש שלך בפלטפורמה כפוף למדיניות הפרטיות שלנו, שאפשר למצוא <a href="#">כאן</a>. אנא קרא את מדיניות הפרטיות כדי
                    להבין איך אנחנו אוספים את המידע שלך, משתמשים בו ומגינים עליו.
                  </p>

                  <h2>5. תוכן משתמשים</h2>
                  <p>
                    אתה האחראי הבלעדי לכל תוכן שאתה מפרסם, מעלה או משתף בפלטפורמה, לרבות הפרופיל, ההודעות וחומרים אחרים שלך (&quot;תוכן
                    משתמש&quot;). אתה מעניק לנו רישיון עולמי, לא בלעדי ופטור מתמלוגים להשתמש בתוכן המשתמש שלך, להציג אותו ולהפיץ אותו,
                    ככל שנדרש להפעלת הפלטפורמה ולשיפורה.
                  </p>

                  <h2>6. פעילויות אסורות</h2>
                  <p>
                    אתה מסכים שלא: להשתמש בפלטפורמה להעברת וירוסים, תוכנות זדוניות או קוד מזיק אחר. לעסוק בספאם, בפישינג או בפרקטיקות
                    מטעות אחרות. לאסוף מידע אישי של משתמשים אחרים בלי הסכמתם. להשתמש בכלים אוטומטיים (למשל בוטים או סורקים) כדי לגשת
                    לפלטפורמה או לפעול בה בלי רשות.
                  </p>

                  <h2>7. סיום</h2>
                  <p>
                    אנחנו שומרים לעצמנו את הזכות להשעות או לסגור את חשבונך ואת גישתך לפלטפורמה לפי שיקול דעתנו, לרבות בשל הפרה של
                    התנאים האלה או של כל דין חל.
                  </p>

                  <h2>8. הסתייגויות</h2>
                  <p>
                    הפלטפורמה מסופקת &quot;כמות שהיא&quot;, ללא אחריות מכל סוג, מפורשת או משתמעת. איננו מתחייבים לדיוק, לאמינות או
                    לזמינות של הפלטפורמה, ואיננו אחראים לתוכן שמפרסמים משתמשים.
                  </p>

                  <h2>9. הגבלת אחריות</h2>
                  <p>
                    במידה המרבית המותרת בחוק, לא נישא באחריות לכל נזק עקיף, מקרי, מיוחד, תוצאתי או עונשי הנובע מהשימוש שלך בפלטפורמה.
                  </p>

                  <h2>10. הדין החל</h2>
                  <p>
                    תנאים אלה יהיו כפופים לדיני [Jurisdiction] ויפורשו לפיהם, בלי להתחשב בכללי ברירת הדין שלהם.
                  </p>

                  <h2>11. שינויים בתנאים</h2>
                  <p>
                    אנחנו שומרים לעצמנו את הזכות לעדכן או לשנות את התנאים האלה בכל עת. כל שינוי יפורסם בעמוד זה עם תאריך עדכון חדש.
                    המשך השימוש שלך בפלטפורמה לאחר שינוי כזה מהווה הסכמה לתנאים המעודכנים.
                  </p>

                  <h2>12. צור קשר</h2>
                  <p>
                    לשאלות על התנאים האלה או על הפלטפורמה אפשר לפנות אלינו בכתובת{" "}
                    <a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a>.
                  </p>
                </div>
              </>
            }
            en={
              <>
                <p className="text-base sm:text-lg">
                  By accessing or using our website, application, or any other services we provide (collectively, the
                  &quot;Platform&quot;), you agree to comply with and be bound by these Terms of Use (the &quot;Terms&quot;). If you
                  do not agree to these Terms, please do not use our Platform.
                </p>

                <div>
                  <h2 className="first:mt-0">1. Eligibility</h2>
                  <p>
                    You must be at least 18 years old or the legal age of majority in your jurisdiction to use this Platform. By using
                    our Platform, you represent and warrant that you meet these eligibility requirements.
                  </p>

                  <h2>2. Account Registration</h2>
                  <p>
                    To use certain features of the Platform, you may be required to create an account. You agree to provide accurate,
                    current, and complete information during the registration process and to update such information to keep it
                    accurate. You are responsible for maintaining the confidentiality of your account credentials and for all
                    activities that occur under your account.
                  </p>

                  <h2>3. Use of the Platform</h2>
                  <p>
                    You agree to use the Platform in a lawful manner and for lawful purposes only. You shall not: Engage in any activity
                    that violates the rights of others, including but not limited to harassment, impersonation, or infringement of
                    intellectual property. Upload, post, or transmit content that is unlawful, offensive, or violates the rights of any
                    person or entity. Attempt to interfere with or disrupt the Platform or servers connected to the Platform.
                  </p>

                  <h2>4. Privacy</h2>
                  <p>
                    Your use of the Platform is governed by our Privacy Policy, which can be found <a href="#">here</a>. Please review
                    the Privacy Policy to understand how we collect, use, and protect your information.
                  </p>

                  <h2>5. User Content</h2>
                  <p>
                    You are solely responsible for any content you post, upload, or share on the Platform, including your profile,
                    messages, and other materials (&quot;User Content&quot;). You grant us a worldwide, royalty-free, and non-exclusive
                    license to use, display, and distribute your User Content as necessary to operate and improve the Platform.
                  </p>

                  <h2>6. Prohibited Activities</h2>
                  <p>
                    You agree not to: Use the Platform to transmit any viruses, malware, or other harmful code. Engage in spamming,
                    phishing, or other deceptive practices. Collect personal data of other users without their consent. Use automated
                    tools (e.g., bots, scrapers) to access or interact with the Platform without permission.
                  </p>

                  <h2>7. Termination</h2>
                  <p>
                    We reserve the right to suspend or terminate your account and access to the Platform at our discretion, including
                    for violations of these Terms or any applicable law.
                  </p>

                  <h2>8. Disclaimers</h2>
                  <p>
                    The Platform is provided &quot;as is&quot; without any warranties, express or implied. We do not guarantee the
                    accuracy, reliability, or availability of the Platform, and we are not responsible for any content posted by users.
                  </p>

                  <h2>9. Limitation of Liability</h2>
                  <p>
                    To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special, consequential,
                    or punitive damages arising out of your use of the Platform.
                  </p>

                  <h2>10. Governing Law</h2>
                  <p>
                    These Terms will be governed by and construed in accordance with the laws of [Jurisdiction], without regard to its
                    conflict of law principles.
                  </p>

                  <h2>11. Changes to Terms</h2>
                  <p>
                    We reserve the right to update or modify these Terms at any time. Any changes will be posted on this page with an
                    updated revision date. Your continued use of the Platform after such changes constitutes your acceptance of the
                    modified Terms.
                  </p>

                  <h2>12. Contact Us</h2>
                  <p>
                    If you have any questions about these Terms or the Platform, please contact us at{" "}
                    <a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a>.
                  </p>
                </div>
              </>
            }
          />
        </article>
      </div>
    </LangBox>
  );
}
