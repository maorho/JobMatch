import Image from "next/image";

export const AdminHero = () => (
  <div className="relative w-full h-[526px] max-w-[1440px] mx-auto mt-4 lg:mt-5">
    <Image
      src="/admin_hero.jpg"
      alt="recruiter image"
      fill
      className="object-cover rounded-[20px] lg:rounded-[60px]"
      priority
    />
  </div>
);

export const RecruiterHeroImage = () => (
  <div className="relative w-full h-[526px] max-w-[1440px] mx-auto mt-4 lg:mt-5">
    <Image
      src="/recruiter_hero.jpg"
      alt="recruiter image"
      fill
      className="object-cover rounded-[20px] lg:rounded-[60px]"
      priority
    />
  </div>
);

export const HeroImg = () => (
  <div className="relative w-full h-[550px] md:h-[700px] lg:h-screen overflow-hidden rounded-[20px] lg:rounded-[60px]">
    <Image
      src="/hero.jpg"
      alt="Hero background"
      fill
      className="object-cover"
      priority
    />
  </div>
);

export const CandidateHeroImage = () => (
  <div className="relative w-full h-[450px] max-w-[1440px] mx-auto mt-4 lg:mt-5 bg-black/40 lg:rounded-[60px] rounded-[20px]">
    <Image
      src="/candidate_hero.png"
      alt="Candidate hero background"
      fill
      className="object-cover rounded-[20px] lg:rounded-[60px]"
      priority
    />
  </div>
);