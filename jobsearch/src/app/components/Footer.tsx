import Image from "next/image";
import Link from "next/link";

function Footer() {
  const year = new Date().getUTCFullYear();
  const LinkedinIcon = () => (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.50002 0.166748H12.5C15.1667 0.166748 17.3334 2.33342 17.3334 5.00008V12.0001C17.3334 13.282 16.8241 14.5113 15.9177 15.4178C15.0113 16.3242 13.7819 16.8334 12.5 16.8334H5.50002C2.83335 16.8334 0.666687 14.6668 0.666687 12.0001V5.00008C0.666687 3.7182 1.17591 2.48882 2.08234 1.5824C2.98876 0.675973 4.21814 0.166748 5.50002 0.166748ZM5.33335 1.83342C4.5377 1.83342 3.77464 2.14949 3.21203 2.7121C2.64942 3.2747 2.33335 4.03777 2.33335 4.83342V12.1667C2.33335 13.8251 3.67502 15.1668 5.33335 15.1668H12.6667C13.4623 15.1668 14.2254 14.8507 14.788 14.2881C15.3506 13.7255 15.6667 12.9624 15.6667 12.1667V4.83342C15.6667 3.17508 14.325 1.83342 12.6667 1.83342H5.33335ZM13.375 3.08342C13.6513 3.08342 13.9162 3.19316 14.1116 3.38851C14.3069 3.58386 14.4167 3.84881 14.4167 4.12508C14.4167 4.40135 14.3069 4.6663 14.1116 4.86165C13.9162 5.057 13.6513 5.16675 13.375 5.16675C13.0988 5.16675 12.8338 5.057 12.6385 4.86165C12.4431 4.6663 12.3334 4.40135 12.3334 4.12508C12.3334 3.84881 12.4431 3.58386 12.6385 3.38851C12.8338 3.19316 13.0988 3.08342 13.375 3.08342ZM9.00002 4.33342C10.1051 4.33342 11.1649 4.7724 11.9463 5.5538C12.7277 6.33521 13.1667 7.39501 13.1667 8.50008C13.1667 9.60515 12.7277 10.665 11.9463 11.4464C11.1649 12.2278 10.1051 12.6668 9.00002 12.6667C7.89495 12.6668 6.83514 12.2278 6.05374 11.4464C5.27234 10.665 4.83335 9.60515 4.83335 8.50008C4.83335 7.39501 5.27234 6.33521 6.05374 5.5538C6.83514 4.7724 7.89495 4.33342 9.00002 4.33342ZM9.00002 6.00008C8.33698 6.00008 7.7011 6.26347 7.23225 6.73232C6.76341 7.20116 6.50002 7.83704 6.50002 8.50008C6.50002 9.16312 6.76341 9.79901 7.23225 10.2679C7.7011 10.7367 8.33698 11.0001 9.00002 11.0001C9.66306 11.0001 10.2989 10.7367 10.7678 10.2679C11.2366 9.79901 11.5 9.16312 11.5 8.50008C11.5 7.83704 11.2366 7.20116 10.7678 6.73232C10.2989 6.26347 9.66306 6.00008 9.00002 6.00008Z"
        fill="#102B39"
      />
    </svg>
  );
  const GitIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 30 30"
      width="22px"
      height="22px"
    >
      {" "}
      <path d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z" />
    </svg>
  );
  const FacebookIcon = () => (
    <svg
      width="20"
      height="21"
      viewBox="0 0 20 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18.3334 10.5001C18.3334 5.90008 14.6 2.16675 10 2.16675C5.40002 2.16675 1.66669 5.90008 1.66669 10.5001C1.66669 14.5334 4.53335 17.8917 8.33335 18.6667V13.0001H6.66669V10.5001H8.33335V8.41675C8.33335 6.80841 9.64169 5.50008 11.25 5.50008H13.3334V8.00008H11.6667C11.2084 8.00008 10.8334 8.37508 10.8334 8.83342V10.5001H13.3334V13.0001H10.8334V18.7917C15.0417 18.3751 18.3334 14.8251 18.3334 10.5001Z"
        fill="#102B39"
      />
    </svg>
  );
  return (
    <footer className="bg-white pt-[120px]">
      <div className="flex justify-center items-center mb-10">
        <div className="my-28 lg:my-32 w-[508px] h-[289px] flex flex-col justify-center items-center">
          <div>
            <Image
              src="/favicon.png"
              alt="Profile"
              width={150}
              height={150}
              priority
              style={{ height: "auto", width: "auto" }}
            />
          </div>
          <div>
            <ul className="gap-[50px] items-center flex flex-col md:flex-row lg:flex-row  ">
              <li className="hover:text-blue-500 font-outfit text-[16px]">
                <Link
                  href="/CompaniesPage"
                  className="hover:text-blue-500 font-outfit h-[11px] w-[80px] text-[16px]"
                >
                  Companies
                </Link>
              </li>
              <li>
                <Link
                  href="/Articels"
                  className="hover:text-blue-500 font-outfit h-[54px] w-[145px] text-[16px]"
                >
                  Articels
                </Link>
              </li>
              <li>
                <Link
                  href="/ContactUs"
                  className="hover:text-blue-500 font-outfit h-[11px] w-[79px] text-[16px]"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link
                  href="/TermsOfConditions"
                  className="hover:text-blue-500 font-outfit h-[11px] w-[145px] text-[16px]"
                >
                  Terms Of Conditions
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <ul className="gap-[50px] flex py-[40px] ">
              <li className="hover:text-blue-500 font-outfit w-[48px] h-[48px] rounded-full  border-1 border-[#102B39]">
                <Link
                  className="flex justify-center items-center py-[15px]"
                  href="https://www.linkedin.com/in/maor-homri-a78665229/"
                >
                  <LinkedinIcon />
                </Link>
              </li>
              <li className="hover:text-blue-500 font-outfit w-[48px] h-[48px] rounded-full  border-1 border-[#102B39]">
                <Link
                  className="flex justify-center items-center py-[13px]"
                  href="https://www.github.com/maorho/JobMatch"
                >
                  <GitIcon />
                </Link>
              </li>
              <li className="hover:text-blue-500 font-outfit w-[48px] h-[48px] rounded-full  border-1 border-[#102B39]">
                <Link
                  className="flex justify-center items-center py-[13px]"
                  href="https://www.linkedin.com/in/maor-homri-a78665229/"
                >
                  <FacebookIcon />
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-[#11AEFF] w-auto h-auto flex py-[20px] items-center justify-center">
        <span className="font-outfit text-white text-[16px]">
          © {year} Job Match. All Rights Reserved.
        </span>
      </div>
    </footer>
  );
}

export default Footer;
