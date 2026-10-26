import { Adapter, AtsType } from "../types";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { comeet } from "./comeet";
import { serpapi } from "./serpapi";
import { amazon } from "./amazon";
import { workday } from "./workday";
import { ashby } from "./ashby";
import { smartrecruiters } from "./smartrecruiters";
import { recruitee } from "./recruitee";
import { google } from "./google";
import { apple } from "./apple";
import { html } from "./html";
import { workable } from "./workable";
import { eightfold } from "./eightfold";

/** Maps a CompanySource.atsType to its adapter. "generic" (scraping) is TODO. */
export const adapters: Partial<Record<AtsType, Adapter>> = {
  greenhouse,
  lever,
  comeet,
  ashby,
  smartrecruiters,
  recruitee,
  serpapi,
  amazon,
  workday,
  google,
  apple,
  html,
  workable,
  eightfold,
};

export function getAdapter(atsType: string): Adapter | undefined {
  return adapters[atsType as AtsType];
}
