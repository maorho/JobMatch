import { PageHeader } from "../components/ui";
import { Bilingual, LangBox } from "../lib/i18n/Bilingual";

export default function AboutPage() {
  return (
    <LangBox className="jm-page">
      <div className="max-w-3xl mx-auto">
        <PageHeader eyebrow="JobMatch" title={<Bilingual he="על הפרויקט" en="About This Project" />} />

        <div className="jm-card p-6 sm:p-10 space-y-8 [&_h2]:jm-h2 [&_h2]:mb-3 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-2 [&_ul]:text-ink-600 [&_ul]:leading-relaxed [&_li]:marker:text-teal">
          <Bilingual
            he={
              <>
                {/* תיאור כללי */}
                <p className="text-base sm:text-lg">
                  JobMatch היא פלטפורמה מבוססת AI להמלצות על משרות, שנועדה להתאים בצורה חכמה בין מועמדים
                  להזדמנויות התעסוקה המתאימות להם ביותר. הפלטפורמה נבנתה עם טכנולוגיות ווב מודרניות ותשתית ענן,
                  ושואפת לשפר את תהליך חיפוש העבודה עבור המועמדים ולתת למעסיקים כלי יעיל למציאת הטאלנט הנכון.
                </p>

                {/* מה עושה הפרויקט */}
                <section>
                  <h2>מה היא עושה?</h2>
                  <ul>
                    <li>התאמת משרות חכמה: הצעות משרה מותאמות אישית על בסיס פרופיל המשתמש.</li>
                    <li>לוח בקרה אישי: מעקב אחרי מועמדויות, שמירת משרות וצפייה בנתונים.</li>
                    <li>פורטל מעסיקים: פרסום משרות וניהול מועמדים ביעילות.</li>
                    <li>תובנות וניתוחים: תובנות שימושיות מבוססות נתונים.</li>
                  </ul>
                </section>

                {/* טכנולוגיות */}
                <section>
                  <h2>טכנולוגיות</h2>
                  <ul>
                    <li>Frontend: Next.js (React)</li>
                    <li>Backend: Node.js, Express.js, RESTful API</li>
                    <li>Database: PostgreSQL (via AWS RDS)</li>
                    <li>Authentication: AWS Cognito</li>
                    <li>Cloud: AWS (EC2, S3, RDS, CloudWatch)</li>
                    <li>DevOps: Docker, GitHub Actions</li>
                    <li>Extras: Kubernetes (EKS), Swagger (API docs)</li>
                  </ul>
                </section>

                {/* למה הפרויקט */}
                <section>
                  <h2>למה הפרויקט הזה?</h2>
                  <p>
                    הפרויקט מדגים מומחיות Full Stack: ארכיטקטורה שמתרחבת, מערכות מאובטחות ופריסה בענן.
                    זו אפליקציה מעשית מהעולם האמיתי, שמראה רמה טכנית גבוהה ויצירתיות.
                  </p>
                </section>

                {/* מפתח */}
                <section>
                  <h2>מי בנה את זה</h2>
                  <p>
                    פותח על ידי בוגר מדעי המחשב עם תשוקה לבנות טכנולוגיה משמעותית ולצאת לדרך בקריירה של
                    פיתוח Full Stack / Backend.
                  </p>
                </section>
              </>
            }
            en={
              <>
                <p className="text-base sm:text-lg">
                  JobMatch is an AI-powered job recommendation platform designed to
                  intelligently match candidates with the most suitable job opportunities.
                  Built with modern web technologies and cloud infrastructure, the
                  platform aims to improve the job-hunting process for applicants while
                  providing employers with an efficient tool to find the right talent.
                </p>

                <section>
                  <h2>What Does It Do?</h2>
                  <ul>
                    <li>
                      Smart Job Matching: Personalized job suggestions based on user
                      profiles.
                    </li>
                    <li>
                      Personal Dashboard: Track applications, save jobs, and view analytics.
                    </li>
                    <li>
                      Employer Portal: Post jobs and manage candidates efficiently.
                    </li>
                    <li>
                      Insights & Analytics: Get valuable data-driven insights.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2>Technologies Used</h2>
                  <ul>
                    <li>Frontend: Next.js (React)</li>
                    <li>Backend: Node.js, Express.js, RESTful API</li>
                    <li>Database: PostgreSQL (via AWS RDS)</li>
                    <li>Authentication: AWS Cognito</li>
                    <li>Cloud: AWS (EC2, S3, RDS, CloudWatch)</li>
                    <li>DevOps: Docker, GitHub Actions</li>
                    <li>
                      Extras: Kubernetes (EKS), Swagger (API docs)
                    </li>
                  </ul>
                </section>

                <section>
                  <h2>Why This Project?</h2>
                  <p>
                    This project demonstrates full-stack expertise, including scalable
                    architecture, secure systems, and cloud-native deployment. It&apos;s a
                    practical, real-world application that shows a high level of technical
                    proficiency and creativity.
                  </p>
                </section>

                <section>
                  <h2>Built By</h2>
                  <p>
                    Developed by a passionate Computer Science graduate with a mission to
                    build meaningful tech and launch a career in full stack/backend
                    development.
                  </p>
                </section>
              </>
            }
          />
        </div>
      </div>
    </LangBox>
  );
}
