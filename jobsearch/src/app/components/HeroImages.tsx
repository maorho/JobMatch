import Image from "next/image";

/**
 * Full-bleed background image for a `jm-hero` block. The hero itself is
 * `relative overflow-hidden`, so this just fills it and sits under the copy.
 */
const HeroBackground = ({ src, alt }: { src: string; alt: string }) => (
  <div className="absolute inset-0">
    <Image src={src} alt={alt} fill sizes="100vw" className="object-cover opacity-30" priority />
  </div>
);

export const AdminHero = () => <HeroBackground src="/admin_hero.jpg" alt="recruiter image" />;

export const RecruiterHeroImage = () => <HeroBackground src="/recruiter_hero.jpg" alt="recruiter image" />;

export const CandidateHeroImage = () => <HeroBackground src="/candidate_hero.png" alt="Candidate hero background" />;
