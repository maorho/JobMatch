import type { AgentDef, AgentName, MessageType } from "./types";
import { ROUTES } from "./types";

const agents = new Map<AgentName, AgentDef>();

/** Register an agent. Throws if it claims a message type the routing table gives to someone else. */
export function registerAgent(def: AgentDef): AgentDef {
  for (const t of def.handles) {
    if (ROUTES[t] !== def.name) throw new Error(`Agent "${def.name}" cannot handle "${t}" — routed to "${ROUTES[t]}"`);
  }
  agents.set(def.name, def);
  return def;
}

export function getAgent(name: AgentName): AgentDef | undefined {
  return agents.get(name);
}

export function listAgents(): AgentDef[] {
  return [...agents.values()];
}

export function ownerOf(type: MessageType): AgentName {
  return ROUTES[type];
}
