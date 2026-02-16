import { MessageInputItem, Role } from "./types";

function makeMessage(role: Role, content: string): MessageInputItem {
  return {
    type: "message",
    role,
    content,
  };
}

export function user(content: string): MessageInputItem {
  return makeMessage("user", content);
}

export function assistant(content: string): MessageInputItem {
  return makeMessage("assistant", content);
}

export function system(content: string): MessageInputItem {
  return makeMessage("system", content);
}
