import Image from "next/image";
import Link from "next/link";
import { Github, Linkedin, Facebook } from "lucide-react";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Jobs" },
      { href: "/Companies", label: "Companies" },
      { href: "/ResumeAI", label: "ResumeAI" },
      { href: "/Articels", label: "Articles" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/Dashboard", label: "Dashboard" },
      { href: "/Settings", label: "Settings" },
      { href: "/Login", label: "Sign in" },
      { href: "/SignUp", label: "Sign up" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/About", label: "About" },
      { href: "/ContactUs", label: "Contact Us" },
      { href: "/TermsOfConditions", label: "Terms of Conditions" },
    ],
  },
];

const SOCIAL = [
  { href: "https://www.linkedin.com/in/maor-homri-a78665229/", label: "LinkedIn", Icon: Linkedin },
  { href: "https://www.github.com/maorho/JobMatch", label: "GitHub", Icon: Github },
  { href: "https://www.facebook.com/", label: "Facebook", Icon: Facebook },
];

function Footer() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="jm-container py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/favicon.png" alt="" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-semibold text-navy">JobMatch</span>
          </Link>
          <p className="text-sm text-ink-600 max-w-xs leading-relaxed">
            Fresh tech openings from hundreds of companies, matched to your résumé, with interview prep built in.
          </p>
          <div className="flex gap-2">
            {SOCIAL.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="h-10 w-10 rounded-xl border border-line text-navy flex items-center justify-center hover:bg-navy hover:text-white transition-colors"
              >
                <Icon className="h-4.5 w-4.5" />
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-navy mb-3">{c.title}</h3>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-600 hover:text-sky transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="jm-container py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-ink-400">
          <span>© {year} JobMatch. All rights reserved.</span>
          <span>Built with Next.js · Powered by AI</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
