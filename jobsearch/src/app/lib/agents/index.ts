/**
 * Import this module (not the agents directly) wherever the bus is driven:
 * it registers every agent, so the dispatcher can route to them.
 */
import "./agents/scout";
import "./agents/locator";
import "./agents/matcher";
import "./agents/notifier";
import "./agents/tracker";
import "./agents/coach";
import "./agents/janitor";
import "./agents/applier";
import "./agents/writer";
import "./agents/researcher";

export { listAgents, getAgent } from "./registry";
export { startRun, startFlow, send, processQueue, readRun, kick } from "./bus";
export { AGENT_NAMES, ROUTES } from "./types";
export type { AgentName, MessageType, Payloads, BusMessage } from "./types";
