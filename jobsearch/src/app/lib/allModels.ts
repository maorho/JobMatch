import type { Model } from "mongoose";
import AddedJobsModel from "@/app/models/AddedJobs";
import AgentMessageModel from "@/app/models/AgentMessage";
import AgentRunModel from "@/app/models/AgentRun";
import ApplicationEventModel from "@/app/models/ApplicationEvent";
import ApplicationOutcomeModel from "@/app/models/ApplicationOutcome";
import ArticleModel from "@/app/models/Article";
import AutoApplicationModel from "@/app/models/AutoApplication";
import CandidatesModel from "@/app/models/Candidates";
import CompanyModel from "@/app/models/Company";
import CompanyBriefModel from "@/app/models/CompanyBrief";
import CompanyProfileModel from "@/app/models/CompanyProfile";
import CompanySourceModel from "@/app/models/CompanySource";
import ContactModel from "@/app/models/Contact";
import ContactMessageModel from "@/app/models/ContactMessage";
import ConversationModel from "@/app/models/Conversation";
import DiscoveryCandidateModel from "@/app/models/DiscoveryCandidate";
import ExternalJobsModel from "@/app/models/ExternalJobs";
import InterviewPrepModel from "@/app/models/InterviewPrep";
import InterviewQuestionModel from "@/app/models/InterviewQuestion";
import InterviewSessionModel from "@/app/models/InterviewSession";
import JobModel from "@/app/models/Job";
import JobSignalModel from "@/app/models/JobSignal";
import LocationAliasModel from "@/app/models/LocationAlias";
import MaintenanceModel from "@/app/models/Maintenance";
import MatchCacheModel from "@/app/models/MatchCache";
import MessageModel from "@/app/models/Message";
import NotificationModel from "@/app/models/Notification";
import OpsAlertModel from "@/app/models/OpsAlert";
import PartnerModel from "@/app/models/Partner";
import PracticeAttemptModel from "@/app/models/PracticeAttempt";
import PracticeTaskModel from "@/app/models/PracticeTask";
import RateLimitModel from "@/app/models/RateLimit";
import ReferralRequestModel from "@/app/models/ReferralRequest";
import ReferrerModel from "@/app/models/Referrer";
import ScoreModelModel from "@/app/models/ScoreModel";
import UsageCounterModel from "@/app/models/UsageCounter";
import UserModel from "@/app/models/User";
import WebInterviewQuestionModel from "@/app/models/WebInterviewQuestion";

/**
 * Every Mongoose model in src/app/models, keyed by file name. Importing this
 * registers them all with mongoose, which sync-indexes relies on: autoIndex is
 * off in production, so a model missing here never gets its indexes (unique
 * email, TTLs, ...). tests/unit/allModels.test.ts fails when a new file under
 * src/app/models isn't listed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_MODELS: Record<string, Model<any>> = {
  AddedJobs: AddedJobsModel,
  AgentMessage: AgentMessageModel,
  AgentRun: AgentRunModel,
  ApplicationEvent: ApplicationEventModel,
  ApplicationOutcome: ApplicationOutcomeModel,
  Article: ArticleModel,
  AutoApplication: AutoApplicationModel,
  Candidates: CandidatesModel,
  Company: CompanyModel,
  CompanyBrief: CompanyBriefModel,
  CompanyProfile: CompanyProfileModel,
  CompanySource: CompanySourceModel,
  Contact: ContactModel,
  ContactMessage: ContactMessageModel,
  Conversation: ConversationModel,
  DiscoveryCandidate: DiscoveryCandidateModel,
  ExternalJobs: ExternalJobsModel,
  InterviewPrep: InterviewPrepModel,
  InterviewQuestion: InterviewQuestionModel,
  InterviewSession: InterviewSessionModel,
  Job: JobModel,
  JobSignal: JobSignalModel,
  LocationAlias: LocationAliasModel,
  Maintenance: MaintenanceModel,
  MatchCache: MatchCacheModel,
  Message: MessageModel,
  Notification: NotificationModel,
  OpsAlert: OpsAlertModel,
  Partner: PartnerModel,
  PracticeAttempt: PracticeAttemptModel,
  PracticeTask: PracticeTaskModel,
  RateLimit: RateLimitModel,
  ReferralRequest: ReferralRequestModel,
  Referrer: ReferrerModel,
  ScoreModel: ScoreModelModel,
  UsageCounter: UsageCounterModel,
  User: UserModel,
  WebInterviewQuestion: WebInterviewQuestionModel,
};
