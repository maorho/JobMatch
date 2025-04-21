// src/app/about/page.tsx (אם אתה משתמש ב-App Router)
// או pages/about.tsx אם אתה משתמש ב-Pages Router

export default function AboutPage() {
  return (
    <div>
      <h1>About This Project</h1>

      <p>
        JobMatch is an AI-powered job recommendation platform designed to
        intelligently match candidates with the most suitable job opportunities.
        Built with modern web technologies and cloud infrastructure, the
        platform aims to improve the job-hunting process for applicants while
        providing employers with an efficient tool to find the right talent.
      </p>

      <h2>What Does It Do?</h2>
      <ul>
        <li>
          Smart Job Matching: Personalized job suggestions based on user
          profiles.
        </li>
        <li>
          Personal Dashboard: Track applications, save jobs, and view analytics.
        </li>
        <li>Employer Portal: Post jobs and manage candidates efficiently.</li>
        <li>Insights & Analytics: Get valuable data-driven insights.</li>
      </ul>

      <h2>Technologies Used</h2>
      <ul>
        <li>Frontend: Next.js (React)</li>
        <li>Backend: Node.js, Express.js, RESTful API</li>
        <li>Database: PostgreSQL (via AWS RDS)</li>
        <li>Authentication: AWS Cognito</li>
        <li>Cloud: AWS (EC2, S3, RDS, CloudWatch)</li>
        <li>DevOps: Docker, GitHub Actions</li>
        <li>Extras: Kubernetes (EKS), Swagger (API docs)</li>
      </ul>

      <h2>Why This Project?</h2>
      <p>
        This project demonstrates full-stack expertise, including scalable
        architecture, secure systems, and cloud-native deployment. It's a
        practical, real-world application that shows a high level of technical
        proficiency and creativity.
      </p>

      <h2>Built By</h2>
      <p>
        Developed by a passionate Computer Science graduate with a mission to
        build meaningful tech and launch a career in full stack/backend
        development.
      </p>
    </div>
  );
}
