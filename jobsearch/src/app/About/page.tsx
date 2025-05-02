export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* כותרת ראשית */}
      <h1 className="text-4xl font-bold text-blue-600 mb-6">
        About This Project
      </h1>

      {/* תיאור כללי */}
      <p className="text-lg mb-6">
        JobMatch is an AI-powered job recommendation platform designed to
        intelligently match candidates with the most suitable job opportunities.
        Built with modern web technologies and cloud infrastructure, the
        platform aims to improve the job-hunting process for applicants while
        providing employers with an efficient tool to find the right talent.
      </p>

      {/* מה עושה הפרויקט */}
      <h2 className="text-2xl font-semibold text-blue-500 mb-4">
        What Does It Do?
      </h2>
      <ul className="list-inside list-disc space-y-2 mb-6">
        <li className="text-lg">
          Smart Job Matching: Personalized job suggestions based on user
          profiles.
        </li>
        <li className="text-lg">
          Personal Dashboard: Track applications, save jobs, and view analytics.
        </li>
        <li className="text-lg">
          Employer Portal: Post jobs and manage candidates efficiently.
        </li>
        <li className="text-lg">
          Insights & Analytics: Get valuable data-driven insights.
        </li>
      </ul>

      {/* טכנולוגיות */}
      <h2 className="text-2xl font-semibold text-blue-500 mb-4">
        Technologies Used
      </h2>
      <ul className="list-inside list-disc space-y-2 mb-6">
        <li className="text-lg">Frontend: Next.js (React)</li>
        <li className="text-lg">Backend: Node.js, Express.js, RESTful API</li>
        <li className="text-lg">Database: PostgreSQL (via AWS RDS)</li>
        <li className="text-lg">Authentication: AWS Cognito</li>
        <li className="text-lg">Cloud: AWS (EC2, S3, RDS, CloudWatch)</li>
        <li className="text-lg">DevOps: Docker, GitHub Actions</li>
        <li className="text-lg">
          Extras: Kubernetes (EKS), Swagger (API docs)
        </li>
      </ul>

      {/* למה הפרויקט */}
      <h2 className="text-2xl font-semibold text-blue-500 mb-4">
        Why This Project?
      </h2>
      <p className="text-lg mb-6">
        This project demonstrates full-stack expertise, including scalable
        architecture, secure systems, and cloud-native deployment. It's a
        practical, real-world application that shows a high level of technical
        proficiency and creativity.
      </p>

      {/* מפתח */}
      <h2 className="text-2xl font-semibold text-blue-500 mb-4">Built By</h2>
      <p className="text-lg">
        Developed by a passionate Computer Science graduate with a mission to
        build meaningful tech and launch a career in full stack/backend
        development.
      </p>
    </div>
  );
}
